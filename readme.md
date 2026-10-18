# SignMetro 🚉🤟

**A Sign-First Railway Station Assistance System**

SignMeet is an accessibility-focused project designed to help deaf and speech-impaired passengers interact with railway station services using sign gestures.

The system recognizes a predefined vocabulary of Indian Sign Language (ISL) gestures using a Transformer-based deep learning model and converts recognized gestures into meaningful application actions. Passengers can access station information, navigate station facilities, request assistance, and report lost items through a sign-first interface.

The initial prototype focuses on **Chennai Egmore Railway Station**, with the architecture designed to support additional stations in the future.

## 🎯 Objectives

- Enable sign-based interaction with railway station services.
- Recognize predefined ISL gestures using a trained Transformer model.
- Provide train information, including destinations, routes, timings, and platform details where verified data is available.
- Help passengers locate station facilities through a visual navigation map.
- Allow passengers to request medical, security, and general assistance.
- Support lost-item and lost-person reporting through a structured workflow.
- Provide a staff dashboard for receiving requests and communicating status updates.
- Design a modular system that can be adapted to other railway stations.

## ✨ Key Features

### 1. Sign Language Recognition
- Real-time hand landmark extraction using MediaPipe.
- Gesture classification using a trained Transformer model.
- Confidence-based gesture confirmation.
- Mapping recognized gestures to predefined application actions.

### 2. Railway Information
- Search trains by destination.
- View scheduled departure information.
- Explore train routes and intermediate stops.
- View platform assignments when verified information is available.

### 3. Station Navigation
- Visual representation of the station layout.
- Navigation to platforms, entrances, ticket counters, help desks, and other facilities.
- Highlighted routes from the terminal's known location.
- Station-specific configuration for future expansion.

### 4. Assistance
- General assistance requests.
- Medical assistance requests.
- Security assistance requests.
- Staff acknowledgement and request-status updates.

### 5. Lost Item and Lost Person Reporting
- Structured reporting forms.
- Collection of relevant details through an accessible interface.
- Staff-side request tracking and status updates.

## 🧠 Sign Vocabulary

The current model supports 11 predefined gesture classes:

| Category | Gestures |
|---|---|
| Railway Information | `TRAIN`, `WHEN`, `DESTINATION`, `ROUTE`, `PLATFORM` |
| Navigation | `WHERE` |
| Ticket-related Interaction | `TICKET` |
| Assistance | `HELP`, `MEDICAL`, `SECURITY` |
| Reporting | `LOST` |

The system uses intent-level gesture recognition rather than unrestricted sign-language translation. Additional details, such as destinations, item categories, and facility names, can be selected through the interface.

## 🏗️ System Architecture

The planned application follows this workflow:

1. The passenger performs a recognized gesture.
2. MediaPipe extracts hand landmarks from the camera feed.
3. The trained Transformer model predicts the gesture class.
4. The intent engine interprets the recognized gesture or gesture combination.
5. The application retrieves relevant station data or creates an assistance request.
6. The passenger receives visual feedback.
7. Staff can review requests and send status updates through the staff dashboard.

```text
Passenger
    |
    v
Camera Input
    |
    v
MediaPipe Hand Landmarks
    |
    v
Trained Transformer Model
    |
    v
Gesture Recognition
    |
    v
Intent / State Engine
    |
    +--------------------+
    |                    |
    v                    v
Railway Information   Station Navigation
    |                    |
    +--------------------+
    |
    v
Assistance / Reporting
    |
    v
Backend and Database
    |
    v
Staff Dashboard
    |
    v
Visual Status Update
```

## 🛠️ Technology Stack

The following technologies are planned or used in the project. The final stack may evolve during integration.

| Component | Technology |
|---|---|
| Gesture Recognition | Python |
| Hand Landmark Extraction | MediaPipe |
| Model | Transformer-based deep learning |
| Computer Vision | OpenCV |
| Frontend | React |
| Backend | Node.js and Express |
| Database | To be finalized |
| Real-time Communication | WebSockets |
| Station Navigation | Custom station map and route logic |


**SignMeet — Making railway station services more accessible, one sign at a time.**