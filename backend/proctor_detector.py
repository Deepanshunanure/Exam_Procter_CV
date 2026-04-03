"""
proctor_detector.py
────────────────────────────────────────────────────────────────────────────────
Full proctored-test activity detector + FastAPI WebSocket API

Detects:
  1.  Drowsiness          – EAR (Eye Aspect Ratio) over consecutive frames
  2.  Yawning             – MAR (Mouth Aspect Ratio)
  3.  Head-pose / gaze    – looking left / right / up / down away from screen
  4.  Multiple faces       – second person in frame
  5.  No face             – candidate left the frame
  6.  Phone               – YOLO object detection (cell phone class)
  7.  Unknown objects      – any YOLO object that isn't a laptop / monitor / mouse /
                             keyboard / book / cup / person
  8.  Hands raised         – MediaPipe Hands detects wrist above eye line
  9.  Face covered         – hand landmark overlaps face bounding box
  10. Suspicious mouth     – whispering / lip-sync (MAR oscillation pattern)

API endpoints
  WebSocket  ws://host/ws/proctor/{session_id}
               <- send : base64-encoded JPEG frame (plain text — NOT JSON)
               -> recv : JSON ViolationFrame (see below)

  POST   /session/start          -> { session_id, started_at }
  POST   /session/{id}/end       -> { session_id, duration_s, violation_summary }
  GET    /session/{id}/violations -> list[ViolationEvent]
  GET    /session/{id}/report     -> full session report dict
  GET    /health                  -> { status, mediapipe, yolo, active_sessions }

Install:
  pip install fastapi uvicorn websockets opencv-python mediapipe \
              ultralytics numpy scipy

Run:
  uvicorn proctor_detector:app --host 0.0.0.0 --port 8765 --reload
────────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import base64
import logging
import time
import uuid
from collections import deque, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Deque

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── optional heavy imports (graceful degradation if missing) ──────────────────
try:
    import mediapipe as mp
    mp_face_mesh      = mp.solutions.face_mesh
    mp_face_detect    = mp.solutions.face_detection
    mp_hands          = mp.solutions.hands
    mp_drawing        = mp.solutions.drawing_utils
    mp_drawing_styles = mp.solutions.drawing_styles
    HAS_MEDIAPIPE     = True
except ImportError:
    HAS_MEDIAPIPE = False
    logging.warning("MediaPipe not found — face/hand detections disabled")

try:
    from ultralytics import YOLO as _YOLO
    _yolo_model = _YOLO("yolov8n.pt")   # auto-downloads ~6 MB on first run
    HAS_YOLO    = True
except Exception:
    HAS_YOLO    = False
    logging.warning("YOLOv8 not found — object detection disabled")

# ─────────────────────────────────────────────────────────────────────────────
# Constants & thresholds
# ─────────────────────────────────────────────────────────────────────────────

LEFT_EYE    = [362, 385, 387, 263, 373, 380]
RIGHT_EYE   = [33,  160, 158, 133, 153, 144]
MOUTH_OUTER = [13, 14, 78, 308]

MODEL_POINTS = np.array([
    (0.0,    0.0,    0.0),
    (0.0,  -330.0,  -65.0),
    (-225.0, 170.0, -135.0),
    (225.0,  170.0, -135.0),
    (-150.0, -150.0, -125.0),
    (150.0,  -150.0, -125.0),
], dtype=np.float64)

POSE_LM_IDS = [1, 152, 33, 263, 61, 291]

EAR_THRESH          = 0.22
MAR_THRESH          = 0.60
EAR_CONSEC_FRAMES   = 20
MAR_CONSEC_FRAMES   = 15
YAW_THRESH          = 30.0
PITCH_THRESH        = 20.0
NO_FACE_FRAMES      = 15
MULTI_FACE_FRAMES   = 5
HAND_RAISE_FRAMES   = 10
OBJECT_CONSEC_FRAMES = 8

ALLOWED_YOLO_CLASSES = {
    "person", "laptop", "tv", "monitor", "keyboard", "mouse",
    "cup", "bottle", "chair", "desk",
}
FORBIDDEN_YOLO_CLASSES = {
    "cell phone", "book", "remote", "scissors", "knife",
    "pen", "pencil", "paper", "notebook",
}
PHONE_ALIASES = {"cell phone", "mobile phone", "phone"}

SEVERITY = {
    "drowsy":           "high",
    "yawn":             "low",
    "look_away":        "medium",
    "no_face":          "high",
    "multiple_faces":   "critical",
    "phone_detected":   "critical",
    "unknown_object":   "high",
    "hand_raised":      "medium",
    "face_covered":     "high",
    "whisper":          "medium",
}

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models  — FIX 5: added `id`, ISO timestamp, duration_seconds
# ─────────────────────────────────────────────────────────────────────────────

class ViolationEvent(BaseModel):
    id: str                        # FIX: uuid string (frontend needs it)
    type: str
    severity: str
    timestamp: str                 # FIX: ISO-8601 string (was unix float)
    message: str
    frame_data: Optional[str] = None


class ViolationFrame(BaseModel):
    """Returned via WebSocket on every processed frame."""
    session_id:   str
    frame_number: int
    timestamp:    float            # kept as unix float (internal use only)
    ear:          float
    mar:          float
    yaw:          float
    pitch:        float
    roll:         float
    num_faces:    int
    num_hands:    int
    objects_detected: List[str]
    alerts:       List[str]
    new_violations: List[ViolationEvent]
    annotated_frame: Optional[str] = None


class SessionStartResponse(BaseModel):
    session_id: str
    started_at: str


class SessionEndResponse(BaseModel):
    session_id:         str
    duration_s:         float      # kept for backward compat
    violation_summary:  Dict[str, int]


class SessionReport(BaseModel):
    session_id:         str
    started_at:         str
    ended_at:           Optional[str]
    duration_seconds:   float      # FIX: was duration_s — must match frontend type
    total_frames:       int
    violation_summary:  Dict[str, int]
    violations:         List[ViolationEvent]
    risk_score:         int        # FIX: int 0-100 (frontend gauge expects int)


# ─────────────────────────────────────────────────────────────────────────────
# Session store
# ─────────────────────────────────────────────────────────────────────────────

class Session:
    def __init__(self, session_id: str):
        self.session_id  = session_id
        self.started_at  = datetime.now(timezone.utc).isoformat()
        self.ended_at: Optional[str] = None
        self.start_ts    = time.time()
        self.frame_count = 0
        self.violations: List[ViolationEvent] = []
        self._last_violation_ts: Dict[str, float] = {}
        self._violation_cooldown = 3.0

    def add_violation(self, v_type: str, message: str,
                      snapshot_b64: Optional[str] = None) -> Optional[ViolationEvent]:
        now = time.time()
        last = self._last_violation_ts.get(v_type, 0)
        if now - last < self._violation_cooldown:
            return None
        self._last_violation_ts[v_type] = now

        # FIX: uuid id + ISO timestamp
        ev = ViolationEvent(
            id=str(uuid.uuid4()),
            type=v_type,
            severity=SEVERITY.get(v_type, "medium"),
            timestamp=datetime.now(timezone.utc).isoformat(),
            message=message,
            frame_data=snapshot_b64,
        )
        self.violations.append(ev)
        return ev

    def summary(self) -> Dict[str, int]:
        counts: Dict[str, int] = defaultdict(int)
        for v in self.violations:
            counts[v.type] += 1
        return dict(counts)

    def risk_score(self) -> int:
        weights = {
            "multiple_faces":   20,
            "phone_detected":   20,
            "no_face":          15,
            "unknown_object":   12,
            "face_covered":     10,
            "drowsy":           8,
            "look_away":        5,
            "whisper":          5,
            "hand_raised":      4,
            "yawn":             1,
        }
        score = 0.0
        for v in self.violations:
            score += weights.get(v.type, 3)
        return int(min(round(score), 100))   # FIX: return int

    def duration(self) -> float:
        return time.time() - self.start_ts


_sessions: Dict[str, Session] = {}


# ─────────────────────────────────────────────────────────────────────────────
# Core detector class (one instance per WebSocket connection)
# ─────────────────────────────────────────────────────────────────────────────

class ProctoringDetector:
    def __init__(self, session: Session):
        self.session      = session
        self.frame_number = 0

        self.ear_counter        = 0
        self.mar_counter        = 0
        self.no_face_counter    = 0
        self.multi_face_counter = 0
        self.look_away_counter  = 0
        self.hand_raise_counter = 0
        self.object_counters: Dict[str, int] = defaultdict(int)

        self.drowsy_active = False
        self.yawn_active   = False

        self._mar_history: Deque[float] = deque(maxlen=60)

        if HAS_MEDIAPIPE:
            self.face_mesh = mp_face_mesh.FaceMesh(
                max_num_faces=4,
                refine_landmarks=True,
                min_detection_confidence=0.55,
                min_tracking_confidence=0.55,
            )
            self.hands = mp_hands.Hands(
                max_num_hands=2,
                min_detection_confidence=0.6,
                min_tracking_confidence=0.6,
            )
        else:
            self.face_mesh = None
            self.hands     = None

    @staticmethod
    def _ear(lms, indices, w, h) -> float:
        pts = [(lms[i].x * w, lms[i].y * h) for i in indices]
        v1  = np.linalg.norm(np.subtract(pts[1], pts[5]))
        v2  = np.linalg.norm(np.subtract(pts[2], pts[4]))
        h1  = np.linalg.norm(np.subtract(pts[0], pts[3]))
        return (v1 + v2) / (2.0 * h1 + 1e-6)

    @staticmethod
    def _mar(lms, indices, w, h) -> float:
        pts   = [(lms[i].x * w, lms[i].y * h) for i in indices]
        vert  = np.linalg.norm(np.subtract(pts[0], pts[1]))
        horiz = np.linalg.norm(np.subtract(pts[2], pts[3]))
        return vert / (horiz + 1e-6)

    @staticmethod
    def _head_pose(lms, w, h) -> tuple[float, float, float]:
        img_pts = np.array(
            [(lms[i].x * w, lms[i].y * h) for i in POSE_LM_IDS],
            dtype=np.float64,
        )
        focal = w
        cam   = np.array([[focal, 0, w / 2],
                           [0, focal, h / 2],
                           [0, 0, 1]], dtype=np.float64)
        dist  = np.zeros((4, 1))
        ok, rvec, _ = cv2.solvePnP(MODEL_POINTS, img_pts, cam, dist,
                                    flags=cv2.SOLVEPNP_SQPNP)
        if not ok:
            return 0.0, 0.0, 0.0
        rmat, _ = cv2.Rodrigues(rvec)
        proj    = np.hstack((rmat, np.zeros((3, 1))))
        _, _, _, _, _, _, euler = cv2.decomposeProjectionMatrix(proj)
        return float(euler[1]), float(euler[0]), float(euler[2])

    @staticmethod
    def _yolo_scan(frame: np.ndarray) -> tuple[List[str], List[tuple]]:
        if not HAS_YOLO:
            return [], []
        results  = _yolo_model(frame, verbose=False, conf=0.40)[0]
        names, boxes = [], []
        for box in results.boxes:
            cls_id   = int(box.cls[0])
            cls_name = results.names[cls_id].lower()
            if float(box.conf[0]) < 0.40:
                continue
            xyxy = box.xyxy[0].cpu().numpy().astype(int)
            names.append(cls_name)
            boxes.append(tuple(xyxy))
        return names, boxes

    def _detect_whisper(self, mar: float) -> bool:
        self._mar_history.append(mar)
        if len(self._mar_history) < 30:
            return False
        arr   = np.array(self._mar_history)
        diffs = np.abs(np.diff(arr))
        rapid = (diffs > 0.05).sum()
        avg   = float(arr.mean())
        return rapid > 15 and 0.10 < avg < MAR_THRESH * 0.85

    def process_frame(self, frame: np.ndarray,
                      return_annotated: bool = True) -> ViolationFrame:
        self.frame_number += 1
        self.session.frame_count += 1
        h, w   = frame.shape[:2]
        ts     = time.time()
        alerts: List[str]            = []
        new_v:  List[ViolationEvent] = []
        annotated = frame.copy()

        ear = 0.0; mar = 0.0
        yaw = 0.0; pitch = 0.0; roll = 0.0
        num_faces = 0; num_hands = 0
        objects_found: List[str] = []
        face_bboxes: List[tuple] = []

        def add_violation(vtype: str, msg: str) -> None:
            ev = self.session.add_violation(vtype, msg,
                                             snapshot_b64=_encode_b64(annotated))
            if ev:
                new_v.append(ev)

        # ── 1. MediaPipe face mesh ─────────────────────────────────────────────
        if HAS_MEDIAPIPE and self.face_mesh:
            rgb    = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            fm_res = self.face_mesh.process(rgb)

            if fm_res.multi_face_landmarks:
                num_faces = len(fm_res.multi_face_landmarks)

                # Primary face
                lms = fm_res.multi_face_landmarks[0].landmark

                ear = (self._ear(lms, LEFT_EYE, w, h) +
                       self._ear(lms, RIGHT_EYE, w, h)) / 2.0
                mar = self._mar(lms, MOUTH_OUTER, w, h)

                try:
                    yaw, pitch, roll = self._head_pose(lms, w, h)
                except Exception:
                    yaw = pitch = roll = 0.0

                # Face bounding box
                xs = [lm.x * w for lm in lms]
                ys = [lm.y * h for lm in lms]
                fx1, fy1 = int(min(xs)), int(min(ys))
                fx2, fy2 = int(max(xs)), int(max(ys))
                face_bboxes.append((fx1, fy1, fx2, fy2))
                cv2.rectangle(annotated, (fx1, fy1), (fx2, fy2), (80, 200, 120), 1)

                # Draw mesh
                mp_drawing.draw_landmarks(
                    annotated,
                    fm_res.multi_face_landmarks[0],
                    mp_face_mesh.FACEMESH_CONTOURS,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles
                        .get_default_face_mesh_contours_style(),
                )

                # EAR – drowsiness
                if ear < EAR_THRESH:
                    self.ear_counter += 1
                    if self.ear_counter >= EAR_CONSEC_FRAMES:
                        alerts.append("drowsy")
                        add_violation("drowsy", f"Eyes closed for {self.ear_counter} frames (EAR={ear:.3f})")
                else:
                    self.ear_counter = 0

                # MAR – yawn
                if mar > MAR_THRESH:
                    self.mar_counter += 1
                    if self.mar_counter >= MAR_CONSEC_FRAMES:
                        alerts.append("yawn")
                        add_violation("yawn", f"Yawning detected (MAR={mar:.3f})")
                else:
                    self.mar_counter = 0

                # Head pose
                if abs(yaw) > YAW_THRESH or abs(pitch) > PITCH_THRESH:
                    self.look_away_counter += 1
                    if self.look_away_counter >= 10:
                        alerts.append("look_away")
                        add_violation("look_away",
                                      f"Looking away from screen (yaw={yaw:.1f}°, pitch={pitch:.1f}°)")
                else:
                    self.look_away_counter = max(0, self.look_away_counter - 1)

                # Whisper
                if self._detect_whisper(mar):
                    alerts.append("whisper")
                    add_violation("whisper", "Suspicious lip movement detected")

                # Multiple faces
                if num_faces > 1:
                    self.multi_face_counter += 1
                    if self.multi_face_counter >= MULTI_FACE_FRAMES:
                        alerts.append("multiple_faces")
                        add_violation("multiple_faces",
                                      f"{num_faces} faces detected in frame")
                else:
                    self.multi_face_counter = 0

                self.no_face_counter = 0

            else:
                # No face
                self.no_face_counter += 1
                if self.no_face_counter >= NO_FACE_FRAMES:
                    alerts.append("no_face")
                    add_violation("no_face", "Candidate not visible in frame")

        # ── 2. MediaPipe Hands ─────────────────────────────────────────────────
        if HAS_MEDIAPIPE and self.hands:
            rgb_h  = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            hd_res = self.hands.process(rgb_h)

            if hd_res.multi_hand_landmarks:
                num_hands = len(hd_res.multi_hand_landmarks)

                for hand_lms in hd_res.multi_hand_landmarks:
                    mp_drawing.draw_landmarks(
                        annotated, hand_lms, mp_hands.HAND_CONNECTIONS,
                        mp_drawing.DrawingSpec(color=(0, 200, 100), thickness=1, circle_radius=2),
                        mp_drawing.DrawingSpec(color=(0, 150, 60),  thickness=1),
                    )
                    wrist_y = hand_lms.landmark[0].y * h
                    brow_y  = (face_bboxes[0][1] if face_bboxes else h * 0.35)

                    if wrist_y < brow_y:
                        self.hand_raise_counter += 1
                        if self.hand_raise_counter >= HAND_RAISE_FRAMES:
                            alerts.append("hand_raised")
                            add_violation("hand_raised",
                                          "Hand raised above face (possible cheating signal)")
                    else:
                        self.hand_raise_counter = max(0, self.hand_raise_counter - 2)

                    if face_bboxes:
                        fx1, fy1, fx2, fy2 = face_bboxes[0]
                        overlap = sum(
                            1 for lm in hand_lms.landmark
                            if fx1 <= lm.x * w <= fx2 and fy1 <= lm.y * h <= fy2
                        )
                        if overlap >= 6:
                            alerts.append("face_covered")
                            add_violation("face_covered",
                                          f"Hand covering face ({overlap} landmarks overlap)")

        # ── 3. YOLO object detection (every 3rd frame) ─────────────────────────
        if HAS_YOLO and self.frame_number % 3 == 0:
            small = cv2.resize(frame, (640, 360))
            sx = w / 640; sy = h / 360
            cls_names, yolo_boxes = self._yolo_scan(small)
            objects_found = cls_names

            for cls_name, (bx1, by1, bx2, by2) in zip(cls_names, yolo_boxes):
                bx1 = int(bx1 * sx); by1 = int(by1 * sy)
                bx2 = int(bx2 * sx); by2 = int(by2 * sy)

                if cls_name in PHONE_ALIASES:
                    self.object_counters["phone"] += 1
                    if self.object_counters["phone"] >= OBJECT_CONSEC_FRAMES:
                        alerts.append("phone_detected")
                        add_violation("phone_detected",
                                      f"Mobile phone detected ({cls_name})")
                    cv2.rectangle(annotated, (bx1, by1), (bx2, by2), (0, 0, 255), 2)
                    cv2.putText(annotated, "PHONE!", (bx1, by1 - 8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2)

                elif cls_name in FORBIDDEN_YOLO_CLASSES:
                    key = f"obj_{cls_name}"
                    self.object_counters[key] += 1
                    if self.object_counters[key] >= OBJECT_CONSEC_FRAMES:
                        alerts.append("unknown_object")
                        add_violation("unknown_object",
                                      f"Forbidden object detected: {cls_name}")
                    cv2.rectangle(annotated, (bx1, by1), (bx2, by2), (0, 165, 255), 2)
                    cv2.putText(annotated, f"FORBIDDEN: {cls_name}", (bx1, by1 - 8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 165, 255), 2)

                elif cls_name not in ALLOWED_YOLO_CLASSES:
                    key = f"unk_{cls_name}"
                    self.object_counters[key] += 1
                    if self.object_counters[key] >= OBJECT_CONSEC_FRAMES:
                        alerts.append("unknown_object")
                        add_violation("unknown_object",
                                      f"Unknown object in frame: {cls_name}")
                    cv2.rectangle(annotated, (bx1, by1), (bx2, by2), (255, 165, 0), 2)
                    cv2.putText(annotated, f"UNKNOWN: {cls_name}", (bx1, by1 - 8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 165, 0), 1)
                else:
                    cv2.rectangle(annotated, (bx1, by1), (bx2, by2), (80, 180, 80), 1)
                    cv2.putText(annotated, cls_name, (bx1, by1 - 6),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (80, 180, 80), 1)

            seen_keys = (
                {"phone"} if any(c in PHONE_ALIASES for c in cls_names) else set()
            )
            seen_keys |= {f"obj_{c}" for c in cls_names if c in FORBIDDEN_YOLO_CLASSES}
            seen_keys |= {f"unk_{c}" for c in cls_names
                          if c not in ALLOWED_YOLO_CLASSES | FORBIDDEN_YOLO_CLASSES}
            for key in list(self.object_counters):
                if key not in seen_keys:
                    self.object_counters[key] = max(0, self.object_counters[key] - 1)

        # ── 4. HUD overlay ─────────────────────────────────────────────────────
        annotated = _draw_hud(
            annotated, ear, mar, yaw, pitch, roll,
            num_faces, num_hands, alerts,
            self.session.frame_count, objects_found,
        )

        ann_b64 = _encode_b64(annotated) if return_annotated else None

        return ViolationFrame(
            session_id=self.session.session_id,
            frame_number=self.frame_number,
            timestamp=ts,
            ear=round(ear, 4),
            mar=round(mar, 4),
            yaw=round(yaw, 2),
            pitch=round(pitch, 2),
            roll=round(roll, 2),
            num_faces=num_faces,
            num_hands=num_hands,
            objects_detected=objects_found,
            alerts=list(set(alerts)),
            new_violations=new_v,
            annotated_frame=ann_b64,
        )

    def close(self) -> None:
        if self.face_mesh:
            self.face_mesh.close()
        if self.hands:
            self.hands.close()


# ─────────────────────────────────────────────────────────────────────────────
# Drawing helpers
# ─────────────────────────────────────────────────────────────────────────────

def _draw_hud(
    frame: np.ndarray,
    ear: float, mar: float,
    yaw: float, pitch: float, roll: float,
    num_faces: int, num_hands: int,
    alerts: List[str],
    frame_no: int,
    objects: List[str],
) -> np.ndarray:
    h, w = frame.shape[:2]
    ov   = frame.copy()

    cv2.rectangle(ov, (0, 0), (270, h), (15, 15, 15), -1)
    cv2.addWeighted(ov, 0.5, frame, 0.5, 0, frame)

    def put(text: str, y: int, color=(210, 210, 210), scale: float = 0.50, thick: int = 1):
        cv2.putText(frame, text, (10, y),
                    cv2.FONT_HERSHEY_SIMPLEX, scale, color, thick, cv2.LINE_AA)

    def bar(value, max_val, y, good_color=(80, 200, 80), bad_color=(60, 60, 240), bad_high=False):
        ratio = min(value / (max_val + 1e-6), 1.0)
        color = bad_color if (bad_high and value > max_val) else (
            bad_color if (not bad_high and value < max_val) else good_color
        )
        cv2.rectangle(frame, (10, y), (210, y + 10), (45, 45, 45), -1)
        cv2.rectangle(frame, (10, y), (10 + int(ratio * 200), y + 10), color, -1)

    put("PROCTORING ACTIVE", 24, (255, 255, 255), 0.56, 2)
    cv2.line(frame, (10, 32), (258, 32), (70, 70, 70), 1)

    put(f"EAR  : {ear:.3f}", 58,
        (80, 200, 80) if ear >= EAR_THRESH else (60, 60, 240))
    bar(ear, 0.4, 65, bad_high=False)

    put(f"MAR  : {mar:.3f}", 92,
        (80, 200, 80) if mar <= MAR_THRESH else (0, 200, 230))
    bar(mar, MAR_THRESH, 99, bad_high=True)

    put(f"Yaw  : {yaw:+.1f}", 124,
        (80, 200, 80) if abs(yaw) <= YAW_THRESH else (0, 165, 255))
    put(f"Pitch: {pitch:+.1f}", 144,
        (80, 200, 80) if abs(pitch) <= PITCH_THRESH else (0, 165, 255))

    cv2.line(frame, (10, 160), (258, 160), (60, 60, 60), 1)

    put(f"Faces : {num_faces}", 180,
        (255, 80, 80) if num_faces > 1 else (210, 210, 210))
    put(f"Hands : {num_hands}", 200)
    if objects:
        put(f"Obj   : {', '.join(objects[:3])}", 220,
            (0, 165, 255) if any(o in FORBIDDEN_YOLO_CLASSES | PHONE_ALIASES
                                 for o in objects) else (180, 180, 180))

    put(f"Frame : {frame_no}", 248, (120, 120, 120), 0.42)

    BANNER_H = 52
    banner_colors = {
        "multiple_faces":  (20, 20, 200),
        "phone_detected":  (20, 20, 200),
        "no_face":         (20, 20, 200),
        "unknown_object":  (0, 120, 200),
        "face_covered":    (0, 120, 200),
        "drowsy":          (0, 0, 170),
        "look_away":       (0, 100, 150),
        "hand_raised":     (0, 100, 100),
        "whisper":         (0, 80, 80),
        "yawn":            (0, 60, 60),
    }
    banner_labels = {
        "multiple_faces":  "! MULTIPLE FACES DETECTED",
        "phone_detected":  "! PHONE DETECTED",
        "no_face":         "! CANDIDATE NOT VISIBLE",
        "unknown_object":  "! FORBIDDEN OBJECT",
        "face_covered":    "! FACE COVERED",
        "drowsy":          "! DROWSINESS ALERT",
        "look_away":       "  LOOKING AWAY",
        "hand_raised":     "  HAND RAISED",
        "whisper":         "  SUSPICIOUS LIP MOVEMENT",
        "yawn":            "  YAWNING",
    }
    alert_set = list(dict.fromkeys(alerts))
    for i, alert in enumerate(alert_set[:3]):
        y0    = h - BANNER_H * (i + 1)
        color = banner_colors.get(alert, (60, 60, 60))
        cv2.rectangle(frame, (270, y0), (w, y0 + BANNER_H - 2), color, -1)
        label = banner_labels.get(alert, alert.upper())
        cv2.putText(frame, label, (280, y0 + 32),
                    cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 1, cv2.LINE_AA)

    return frame


def _encode_b64(frame: np.ndarray) -> str:
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return base64.b64encode(buf).decode("utf-8")


def _decode_b64(data: str) -> np.ndarray:
    raw = base64.b64decode(data)
    arr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image — check that the client sends plain base64, not JSON")
    return img


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI application
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Proctoring Detection API",
    description=(
        "Real-time proctored-test activity detector.  "
        "Send video frames over WebSocket; receive violations JSON."
    ),
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST endpoints ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status":          "ok",
        "mediapipe":       HAS_MEDIAPIPE,
        "yolo":            HAS_YOLO,
        "active_sessions": len(_sessions),
    }


@app.post("/session/start", response_model=SessionStartResponse)
async def start_session():
    sid = str(uuid.uuid4())
    _sessions[sid] = Session(sid)
    logger.info(f"Session started: {sid}")
    return SessionStartResponse(session_id=sid, started_at=_sessions[sid].started_at)


@app.post("/session/{session_id}/end", response_model=SessionEndResponse)
async def end_session(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")
    sess = _sessions[session_id]
    sess.ended_at = datetime.now(timezone.utc).isoformat()
    logger.info(f"Session ended: {session_id}")
    return SessionEndResponse(
        session_id=session_id,
        duration_s=round(sess.duration(), 2),
        violation_summary=sess.summary(),
    )


@app.get("/session/{session_id}/violations", response_model=List[ViolationEvent])
async def get_violations(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")
    return _sessions[session_id].violations


@app.get("/session/{session_id}/report", response_model=SessionReport)
async def get_report(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")
    sess = _sessions[session_id]
    return SessionReport(
        session_id=session_id,
        started_at=sess.started_at,
        ended_at=sess.ended_at,
        duration_seconds=round(sess.duration(), 2),   # FIX: was duration_s
        total_frames=sess.frame_count,
        violation_summary=sess.summary(),
        violations=sess.violations,
        risk_score=sess.risk_score(),                 # FIX: now returns int
    )


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws/proctor/{session_id}")
async def websocket_proctor(websocket: WebSocket, session_id: str):
    """
    Protocol
    ---------
    Client -> Server  :  base64-encoded JPEG frame  (plain text — NOT JSON)
    Server -> Client  :  JSON string of ViolationFrame
    """
    await websocket.accept()
    logger.info(f"WS connected: session={session_id}")

    if session_id not in _sessions:
        _sessions[session_id] = Session(session_id)

    sess     = _sessions[session_id]
    detector = ProctoringDetector(sess)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                frame  = _decode_b64(raw)
                result = detector.process_frame(frame, return_annotated=True)
                await websocket.send_text(result.model_dump_json())
            except Exception as e:
                logger.warning(f"Frame processing error: {e}")
                await websocket.send_text(
                    f'{{"error": "{str(e)}", "session_id": "{session_id}"}}'
                )
    except WebSocketDisconnect:
        logger.info(f"WS disconnected: session={session_id}")
    finally:
        detector.close()


# ─────────────────────────────────────────────────────────────────────────────
# Standalone webcam mode  (python proctor_detector.py)
# ─────────────────────────────────────────────────────────────────────────────

def run_webcam():
    sess     = Session("local-test")
    detector = ProctoringDetector(sess)
    cap      = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  960)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 540)

    print("Proctoring Monitor — press 'q' to quit")
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame  = cv2.flip(frame, 1)
            result = detector.process_frame(frame, return_annotated=True)

            if result.annotated_frame:
                ann = _decode_b64(result.annotated_frame)
                cv2.imshow("Proctoring Monitor", ann)

            if result.new_violations:
                for v in result.new_violations:
                    print(f"  [{v.severity.upper()}] {v.type}: {v.message}")

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        detector.close()
        cap.release()
        cv2.destroyAllWindows()
        print("\n--- Session Summary ---")
        for k, v in sess.summary().items():
            print(f"  {k:20s}: {v}")
        print(f"  {'Risk score':20s}: {sess.risk_score()}/100")


if __name__ == "__main__":
    import sys
    if "--server" in sys.argv:
        import uvicorn
        uvicorn.run("proctor_detector:app", host="0.0.0.0", port=8765, reload=True)
    else:
        run_webcam()