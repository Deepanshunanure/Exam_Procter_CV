# 🤝 Contributing to ProctorAI

Thank you for your interest in contributing to ProctorAI! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## 📜 Code of Conduct

### Our Pledge

We are committed to making participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behavior includes:**
- The use of sexualized language or imagery
- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate in a professional setting

## 🚀 Getting Started

### Prerequisites

Before contributing, ensure you have:
- Python 3.8+ installed
- Node.js 18+ installed
- Git configured with your GitHub account
- Basic knowledge of FastAPI and Next.js
- Understanding of computer vision concepts (helpful but not required)

### First-Time Contributors

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/proctor-ai.git
   cd proctor-ai
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/original-owner/proctor-ai.git
   ```
4. **Create a branch** for your contribution:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 🛠️ Development Setup

### Backend Setup

1. **Create virtual environment**:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   pip install -r requirements-dev.txt  # Development dependencies
   ```

3. **Install pre-commit hooks**:
   ```bash
   pre-commit install
   ```

4. **Run the backend**:
   ```bash
   python proctor_detector.py
   ```

### Frontend Setup

1. **Install dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

### Development Tools

**Recommended VS Code Extensions:**
- Python
- Pylance
- ES7+ React/Redux/React-Native snippets
- Prettier - Code formatter
- ESLint
- Tailwind CSS IntelliSense

**Recommended Settings (.vscode/settings.json):**
```json
{
  "python.defaultInterpreterPath": "./backend/venv/bin/python",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true,
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

## 📝 Contributing Guidelines

### Types of Contributions

We welcome various types of contributions:

**🐛 Bug Fixes**
- Fix existing functionality that isn't working as expected
- Improve error handling and edge cases
- Performance optimizations

**✨ New Features**
- Add new detection algorithms
- Implement new UI components
- Enhance existing functionality

**📚 Documentation**
- Improve existing documentation
- Add code comments and docstrings
- Create tutorials and guides

**🧪 Testing**
- Add unit tests
- Improve test coverage
- Add integration tests

**🎨 UI/UX Improvements**
- Enhance user interface design
- Improve accessibility
- Optimize user experience

### Coding Standards

#### Python (Backend)

**Style Guide:**
- Follow [PEP 8](https://pep8.org/) style guide
- Use [Black](https://black.readthedocs.io/) for code formatting
- Use [isort](https://pycqa.github.io/isort/) for import sorting
- Use type hints where possible

**Example:**
```python
from typing import List, Optional, Dict, Any
import numpy as np
from fastapi import FastAPI, WebSocket


class ViolationDetector:
    """Detects violations in exam sessions."""
    
    def __init__(self, thresholds: Dict[str, float]) -> None:
        self.thresholds = thresholds
        self._violations: List[Dict[str, Any]] = []
    
    def detect_violation(
        self, 
        frame: np.ndarray, 
        metrics: Dict[str, float]
    ) -> Optional[Dict[str, Any]]:
        """
        Detect violations in the given frame.
        
        Args:
            frame: Input video frame
            metrics: Calculated metrics for the frame
            
        Returns:
            Violation dictionary if detected, None otherwise
        """
        if metrics["ear"] < self.thresholds["ear"]:
            return {
                "type": "eyes_closed",
                "severity": "medium",
                "confidence": 0.95,
                "timestamp": datetime.utcnow().isoformat()
            }
        return None
```

**Docstring Format:**
```python
def process_frame(frame: np.ndarray, session_id: str) -> Dict[str, Any]:
    """
    Process a video frame for violation detection.
    
    This function analyzes a video frame using computer vision techniques
    to detect potential exam violations such as looking away, speaking, or
    unauthorized objects.
    
    Args:
        frame (np.ndarray): Input video frame in BGR format
        session_id (str): Unique identifier for the exam session
        
    Returns:
        Dict[str, Any]: Processing results containing:
            - violations: List of detected violations
            - metrics: Calculated facial metrics
            - annotated_frame: Frame with annotations
            
    Raises:
        ValueError: If frame is invalid or empty
        ProcessingError: If computer vision processing fails
        
    Example:
        >>> frame = cv2.imread("test_frame.jpg")
        >>> result = process_frame(frame, "session-123")
        >>> print(result["violations"])
        [{"type": "looking_away", "severity": "high"}]
    """
```

#### TypeScript/React (Frontend)

**Style Guide:**
- Use [Prettier](https://prettier.io/) for code formatting
- Use [ESLint](https://eslint.org/) for linting
- Follow React best practices and hooks patterns
- Use TypeScript strict mode

**Example:**
```typescript
interface ViolationEvent {
  id: string;
  timestamp: string;
  type: ViolationType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  confidence: number;
}

interface ProctoringClientProps {
  apiUrl: string;
  onViolation?: (violation: ViolationEvent) => void;
  onSessionEnd?: (report: SessionReport) => void;
}

/**
 * Custom hook for managing proctoring sessions
 * 
 * @param apiUrl - Base URL for the proctoring API
 * @returns Object containing session state and control functions
 */
export const useProctoring = (apiUrl: string) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [violations, setViolations] = useState<ViolationEvent[]>([]);
  const [isActive, setIsActive] = useState(false);
  
  const startSession = useCallback(async (): Promise<string> => {
    try {
      const response = await fetch(`${apiUrl}/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to start session: ${response.statusText}`);
      }
      
      const data = await response.json();
      setSessionId(data.session_id);
      setIsActive(true);
      
      return data.session_id;
    } catch (error) {
      console.error('Error starting session:', error);
      throw error;
    }
  }, [apiUrl]);
  
  return {
    sessionId,
    violations,
    isActive,
    startSession,
    // ... other functions
  };
};
```

### Git Workflow

**Branch Naming:**
- `feature/description` - New features
- `bugfix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions/improvements

**Commit Messages:**
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Examples:**
```
feat(detection): add eye blink detection algorithm

Implement new algorithm for detecting prolonged eye closure
using Eye Aspect Ratio (EAR) calculations.

Closes #123
```

```
fix(websocket): handle connection timeouts gracefully

- Add automatic reconnection logic
- Improve error handling for network issues
- Add exponential backoff for reconnection attempts

Fixes #456
```

```
docs(api): update WebSocket API documentation

Add examples for frame processing and violation events.
```

## 🔄 Pull Request Process

### Before Submitting

1. **Update your branch**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run tests**:
   ```bash
   # Backend tests
   cd backend
   pytest tests/

   # Frontend tests
   cd frontend
   npm test
   ```

3. **Check code quality**:
   ```bash
   # Backend
   black backend/
   isort backend/
   pylint backend/

   # Frontend
   npm run lint
   npm run type-check
   ```

4. **Update documentation** if needed

### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots to help explain your changes.

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

## Related Issues
Closes #(issue number)
```

### Review Process

1. **Automated Checks**: All PRs must pass CI/CD checks
2. **Code Review**: At least one maintainer must approve
3. **Testing**: Changes must include appropriate tests
4. **Documentation**: Update docs for user-facing changes

## 🐛 Issue Guidelines

### Bug Reports

Use the bug report template:

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment:**
 - OS: [e.g. Windows 10, macOS 12.0, Ubuntu 20.04]
 - Browser [e.g. chrome, safari]
 - Version [e.g. 22]
 - Python version: [e.g. 3.9.0]
 - Node.js version: [e.g. 18.0.0]

**Additional context**
Add any other context about the problem here.
```

### Feature Requests

Use the feature request template:

```markdown
**Is your feature request related to a problem? Please describe.**
A clear and concise description of what the problem is.

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots about the feature request here.
```

## 🧪 Testing

### Backend Testing

**Test Structure:**
```
backend/tests/
├── unit/
│   ├── test_detection.py
│   ├── test_session.py
│   └── test_utils.py
├── integration/
│   ├── test_api.py
│   └── test_websocket.py
└── fixtures/
    ├── test_frames/
    └── conftest.py
```

**Example Test:**
```python
import pytest
import numpy as np
from unittest.mock import Mock, patch
from proctor_detector import ProctoringDetector, Session


class TestProctoringDetector:
    """Test cases for ProctoringDetector class."""
    
    @pytest.fixture
    def detector(self):
        """Create a detector instance for testing."""
        session = Mock(spec=Session)
        return ProctoringDetector(session)
    
    @pytest.fixture
    def sample_frame(self):
        """Create a sample video frame for testing."""
        return np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
    
    def test_ear_calculation(self, detector):
        """Test Eye Aspect Ratio calculation."""
        # Mock landmarks for closed eyes
        landmarks = np.array([[0, 0], [10, 5], [20, 0], [15, -5], [5, -5], [10, 0]])
        
        ear = detector._ear(landmarks, [0, 1, 2, 3, 4, 5], 640, 480)
        
        assert 0 <= ear <= 1, "EAR should be between 0 and 1"
        assert ear < 0.2, "Closed eyes should have low EAR"
    
    def test_violation_detection(self, detector, sample_frame):
        """Test violation detection in frame processing."""
        with patch.object(detector, '_detect_face') as mock_detect:
            mock_detect.return_value = True
            
            result = detector.process_frame(sample_frame, 1234)
            
            assert 'violations' in result
            assert 'metrics' in result
            assert 'annotated_frame' in result
    
    @pytest.mark.parametrize("ear_value,expected_violation", [
        (0.15, True),   # Eyes closed
        (0.25, False),  # Eyes open
        (0.20, True),   # Borderline case
    ])
    def test_eyes_closed_detection(self, detector, ear_value, expected_violation):
        """Test eyes closed detection with different EAR values."""
        violation = detector._detect_eyes_closed(ear_value)
        
        if expected_violation:
            assert violation is not None
            assert violation['type'] == 'eyes_closed'
        else:
            assert violation is None
```

### Frontend Testing

**Test Structure:**
```
frontend/__tests__/
├── components/
│   ├── ExamInterface.test.tsx
│   └── ViolationLog.test.tsx
├── hooks/
│   └── useProctor.test.ts
├── utils/
│   └── api.test.ts
└── setup.ts
```

**Example Test:**
```typescript
import { renderHook, act } from '@testing-library/react';
import { useProctor } from '@/lib/proctor-client';

// Mock WebSocket
global.WebSocket = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

describe('useProctor hook', () => {
  const mockApiUrl = 'http://localhost:8765';

  beforeEach(() => {
    fetch.resetMocks();
  });

  it('should start a session successfully', async () => {
    const mockResponse = {
      session_id: 'test-session-123',
      started_at: '2024-01-01T12:00:00Z',
    };

    fetch.mockResponseOnce(JSON.stringify(mockResponse));

    const { result } = renderHook(() => useProctor(mockApiUrl));

    await act(async () => {
      const sessionId = await result.current.begin();
      expect(sessionId).toBe('test-session-123');
    });

    expect(result.current.sessionId).toBe('test-session-123');
    expect(result.current.active).toBe(true);
  });

  it('should handle violations correctly', async () => {
    const { result } = renderHook(() => useProctor(mockApiUrl));
    
    const mockViolation = {
      id: 'violation-1',
      type: 'looking_away',
      severity: 'medium',
      message: 'Head turned away',
      timestamp: '2024-01-01T12:05:00Z',
    };

    act(() => {
      // Simulate receiving a violation via WebSocket
      result.current.handleViolation(mockViolation);
    });

    expect(result.current.violations).toContain(mockViolation);
  });
});
```

### Running Tests

```bash
# Backend tests
cd backend
pytest tests/ -v --cov=. --cov-report=html

# Frontend tests
cd frontend
npm test -- --coverage --watchAll=false

# Integration tests
npm run test:integration

# E2E tests (if available)
npm run test:e2e
```

## 📚 Documentation

### Code Documentation

**Python Docstrings:**
- Use Google-style docstrings
- Include type information
- Provide examples for complex functions
- Document exceptions and edge cases

**TypeScript Comments:**
- Use JSDoc format for functions and classes
- Document complex algorithms and business logic
- Include usage examples

### API Documentation

- Update OpenAPI/Swagger specs for API changes
- Include request/response examples
- Document error codes and responses
- Keep endpoint documentation current

### User Documentation

- Update README.md for user-facing changes
- Add setup instructions for new features
- Include troubleshooting guides
- Provide configuration examples

## 🏗️ Architecture Guidelines

### Backend Architecture

**Principles:**
- Single Responsibility Principle
- Dependency Injection
- Separation of Concerns
- Error Handling at Boundaries

**Structure:**
```
backend/
├── proctor_detector.py      # Main application
├── models/                  # Data models
├── services/               # Business logic
├── utils/                  # Utility functions
├── tests/                  # Test files
└── requirements.txt        # Dependencies
```

### Frontend Architecture

**Principles:**
- Component Composition
- Custom Hooks for Logic
- Context for Global State
- Separation of UI and Logic

**Structure:**
```
frontend/
├── app/                    # Next.js app directory
├── components/            # Reusable components
├── hooks/                 # Custom hooks
├── lib/                   # Utility libraries
├── types/                 # TypeScript types
└── __tests__/            # Test files
```

## 🌟 Recognition

### Contributors

We recognize contributors in several ways:
- GitHub contributors list
- Release notes mentions
- Annual contributor awards
- Conference speaking opportunities

### Contribution Types

All contributions are valued:
- 💻 Code contributions
- 📖 Documentation improvements
- 🐛 Bug reports and testing
- 💡 Feature suggestions
- 🎨 Design and UX improvements
- 🌍 Translations
- 📢 Community support

## 📞 Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Discord**: Real-time chat and community support
- **Email**: Direct contact with maintainers

### Mentorship

New contributors can request mentorship:
- Pair programming sessions
- Code review guidance
- Architecture discussions
- Career advice

## 📄 License

By contributing to ProctorAI, you agree that your contributions will be licensed under the same license as the project (MIT License).

---

<div align="center">
  <strong>Thank you for contributing to ProctorAI! 🎉</strong>
  
  <p>Together, we're building the future of secure online examinations.</p>
</div>