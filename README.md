# 🌌 DriveSync

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React%2019-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Prisma-39827F?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/JSON%20Web%20Tokens-000000?style=for-the-badge&logo=JSON%20web%20tokens&logoColor=d63aff" alt="JWT" />
  <img src="https://img.shields.io/badge/WebAuthn%20/%20Passkeys-FA0589?style=for-the-badge&logo=yubico&logoColor=white" alt="WebAuthn" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License MIT" />
</p>

DriveSync is a beautifully crafted, high-performance personal cloud storage solution built to bridge robust database modeling, enterprise security standards, and high-fidelity file/folder sharing into a calm, organic workspace.

---

> [!IMPORTANT]
> ### 🛡️ Note to Recruiters & Reviewers
> **The core focus and technical challenge of this project is the Backend Architecture, database design, cryptographic implementations (custom WebAuthn, JWT sessions, Google OAuth), and API security, which are entirely my own work.** 
> 
> The frontend UI was built with AI-assistance (for CSS structuring and component templates) to quickly establish a clean, aesthetic interface. This allowed me to allocate **100% of my custom engineering focus to security, database integrity, file processing, and API design.**

---

## 🌟 About DriveSync
DriveSync is a modern alternative to traditional cloud drives. Under the hood, it features a rich directory tree database layout, WebAuthn-compliant biometric authentication, active user session tables, and granular resource sharing scopes. Built on a client-server architecture, it processes files smoothly via Express streams, stores structured meta-records inside PostgreSQL via Prisma, and synchronizes status seamlessly with React.

---

## ✨ Features

### 🟢 Backend Architecture & Core Engine (Focus Area)
*   **Multi-layered Authentication Engine:**
    *   **Custom WebAuthn / Passkeys:** Engineered raw buffer parsing logic for WebAuthn authentication data (`authData` flags, `rpIdHash`, public credentials) and signature verification with Node's native `crypto` library. No bloated third-party wrapper dependencies.
    *   **Google OAuth:** Secure identity assertion verifying tokens directly with Google's authorization libraries.
    *   **Traditional Auth:** Password hashing via `bcryptjs` and secure registration endpoints.
*   **Active Session Management:** A dedicated database session tracking model. Users can review active sessions (displaying device name, IP address, creation time) and revoke specific sessions or sign out of all devices remotely.
*   **Hierarchical File System:** Nested parent-child directory tree structures (`FolderToFolder` self-relation in Prisma) with cascading trash behaviors, star indicators, and database-level duplicate name checks.
*   **Recursive Folder Analytics:** Dynamic size calculations to track used disk spaces against a configurable storage quota (e.g. 10GB limit) with category breakdown reports.
*   **Granular Sharing Matrix:**
    *   **Internal User Sharing:** Granular sharing permissions (`VIEW`, `EDIT`) linked via junction tables (`FileShare`), complete with SMTP-based email alerts.
    *   **Public Access:** Unique, cryptographically signed share link tokens to expose folders and files publicly without exposing database primary keys.
*   **Optimized File Handling:** Support for multi-part file uploads (via `multer`) along with endpoints for chunked uploads and batch reverts for interrupted operations.

### ⚛️ Frontend Interface
*   **Vite + React 19:** Powered by React Router v7 for routing and fast page navigation.
*   **Global Application Contexts:** Custom hooks (`useAuth`, `useFiles`) mapping reactive state to Express backend endpoints.
*   **Interactive File Manager:** View files in grid/list formats, preview audio, video, and image types via sidebar drawer panels, and search dynamically through query endpoints.
*   **Responsive UI:** A modern glassmorphism aesthetic built on a core system styling layout.

---

## 🏗️ Architecture & Flow

### System Topology
```mermaid
graph TD
    Client[React 19 / Vite App] <-->|HTTPS / JSON / JWT| API[Express Router & Middleware]
    API -->|Authenticate Token| JWTMiddleware[JWT / Auth Middleware]
    JWTMiddleware -->|Pass| Controllers[Controllers Layer]
    Controllers -->|Multer Stream| UploadsDir[Local uploads/ directory]
    Controllers -->|Query / Mutate| Prisma[Prisma ORM Client]
    Prisma <-->|SQL Queries| PostgreSQL[(PostgreSQL DB)]
```

### Database Entity-Relationship Model
```mermaid
erDiagram
    User ||--o{ Folder : "owns"
    User ||--o{ File : "owns"
    User ||--o{ Session : "holds active"
    User ||--o{ PasskeyCredential : "registers"
    User ||--o{ FileShare : "shares / receives"
    
    Folder ||--o{ Folder : "nests (parent-child)"
    Folder ||--o{ File : "contains"
    
    File ||--o{ FileShare : "has shared access"
    
    User {
        String id PK
        String email UK
        String password
        String name
        String role
        Boolean webhookEvents
        Boolean emailAlerts
        Boolean smsSecurity
        DateTime createdAt
    }
    Folder {
        String id PK
        String name
        String userId FK
        String parentId FK
        Boolean isTrashed
        Boolean isStarred
        Boolean isPublic
        String publicLinkToken UK
        Int size
    }
    File {
        String id PK
        String name
        String originalName
        String mimeType
        Int size
        String path
        Bytes data
        String userId FK
        String folderId FK
        Boolean isTrashed
        Boolean isStarred
        Boolean isPublic
        String publicLinkToken UK
    }
    Session {
        String id PK
        String token UK
        String userId FK
        String device
        String ipAddress
        DateTime expiresAt
    }
    PasskeyCredential {
        String id PK
        String userId FK
        String credentialId UK
        String publicKey
        Int counter
        String deviceName
    }
```

---

## 📂 Folder Structure

```
DriveSync/
├── frontend/               # ⚛️ React + Vite Frontend
│   ├── public/             # Static public assets
│   ├── src/
│   │   ├── components/     # UI Components (Sidebar, Topbar, EmptyState, etc.)
│   │   ├── context/        # React State Contexts (AuthContext, FilesContext)
│   │   ├── pages/          # Layout Pages (Dashboard, Settings, Auth screens)
│   │   ├── services/       # Axios API client instances
│   │   ├── utils/          # Formatting and assertion helpers
│   │   ├── App.jsx         # App routing setup
│   │   ├── index.css       # Core typography, tokens & variables
│   │   └── main.jsx        # App entry mounting point
│   ├── package.json
│   └── vite.config.js      # Vite dev bundler config
│
├── prisma/                 # 🗃️ Database Layer
│   └── schema.prisma       # Prisma database relations & models
│
├── src/                    # 🟢 Express + TypeScript Backend
│   ├── config/             # DB client, SMTP transporter, and Multer setups
│   ├── controllers/        # Logical controllers (Auth, Passkey, Folders, Files, Stats)
│   ├── middleware/         # Custom routes filters (Token authentication, Error boundaries)
│   ├── routes/             # REST Endpoints mapping definitions
│   ├── app.ts              # Express server config
│   └── index.ts            # Main application bootloader
│
├── package.json            # Node project script configurations
├── tsconfig.json           # TypeScript compilation presets
└── .env                    # System secrets (Git-ignored)
```

---

## 🔌 API Endpoint Specifications

### Authentication & Sessions
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register user account |
| `POST` | `/api/auth/login` | Public | Sign in with email and password |
| `GET` | `/api/auth/profile` | Bearer | Retrieve authenticated user profile |
| `PUT` | `/api/auth/profile` | Bearer | Update user preferences and alert states |
| `DELETE` | `/api/auth/profile` | Bearer | Delete user account permanently |
| `GET` | `/api/auth/sessions` | Bearer | Get list of all logged-in devices and sessions |
| `DELETE` | `/api/auth/sessions/:id` | Bearer | Revoke a specific active user session |
| `DELETE` | `/api/auth/sessions` | Bearer | Clear all other active sessions (logout everywhere) |
| `POST` | `/api/auth/google/verify` | Public | Validate Google OAuth credential tokens |

### WebAuthn Passkeys
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/passkey/register-options` | Bearer | Request registration configurations & challenge |
| `POST` | `/api/passkey/register` | Bearer | Validate attestation response and save credential |
| `POST` | `/api/passkey/auth-options` | Public | Fetch assertion challenge options for a user email |
| `POST` | `/api/passkey/auth` | Public | Validate client assertion signature and issue session token |

### Files Manager
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/files/upload` | Bearer | Upload single file stream via Multer |
| `POST` | `/api/files/upload-chunk` | Bearer | Upload chunk block for sequential uploads |
| `POST` | `/api/files/upload-finish` | Bearer | Assemble chunks into a cohesive file |
| `GET` | `/api/files/download/:id` | Bearer | Stream-download file by primary key |
| `DELETE` | `/api/files/:id` | Bearer | Soft delete a file (move it to trash) |
| `POST` | `/api/files/:id/restore` | Bearer | Restore soft-deleted file |
| `DELETE` | `/api/files/:id/permanent` | Bearer | Purge file metadata and delete physical file |
| `POST` | `/api/files/:id/star` | Bearer | Toggle file starring status |
| `POST` | `/api/files/:id/generate-link`| Bearer | Generate a public link token for anonymous download |
| `POST` | `/api/files/:id/revoke-link` | Bearer | Invalidate file public link token |

### Folders Directory
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/folders` | Bearer | Create a new folder (enforces parent scope uniqueness) |
| `GET` | `/api/folders/:id` | Bearer | Fetch folder info along with its child file & folder lists |
| `DELETE` | `/api/folders/:id` | Bearer | Move folder and its contents to trash recursively |
| `POST` | `/api/folders/:id/restore` | Bearer | Restore folder and recursively restore contents |
| `DELETE` | `/api/folders/:id/permanent`| Bearer | Purge folder and cascade-delete child files/subfolders |
| `POST` | `/api/folders/:id/star` | Bearer | Toggle folder starred status |
| `POST` | `/api/folders/:id/public-link`| Bearer | Make folder contents publicly link-shareable |
| `DELETE` | `/api/folders/:id/public-link`| Bearer | Revoke public folder access token |
| `GET` | `/api/folders/:id/download` | Bearer | Pack folder recursively and stream as a Zip archive |

### Advanced & Auxiliary Services
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/advanced/trash` | Bearer | Get list of all trashed files & folders |
| `GET` | `/api/advanced/starred` | Bearer | Fetch all starred, non-trashed elements |
| `GET` | `/api/advanced/shared` | Bearer | Fetch shared items (public or shared by other users) |
| `GET` | `/api/advanced/storage-stats` | Bearer | Check usage capacity, total sizes, and mimetype chart data |
| `GET` | `/api/advanced/recent` | Bearer | Get the 20 most recently accessed files |
| `POST` | `/api/advanced/files/:id/share-with`| Bearer | Share access to file via email and dispatch SMTP notification |

---

## 🚀 Getting Started

### Prerequisites
*   [Node.js](https://nodejs.org/en) (v18 or higher)
*   [npm](https://www.npmjs.com/) (v9 or higher)
*   A running PostgreSQL database instance (local or hosted, e.g. Neon, Supabase)

### 1. Clone Project
```bash
git clone https://github.com/sujaljondhale/DriveSync.git
cd DriveSync
```

### 2. Backend Server Configuration
1. Install server dependencies:
   ```bash
   npm install
   ```
2. Create and fill in environment parameters by duplicating the example layout:
   ```bash
   cp .env.example .env
   ```
   Modify files inside `.env` to match your parameters:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://user:password@localhost:5432/drivesync?schema=public"
   JWT_SECRET="your_custom_jwt_security_token_phrase"

   # Google OAuth configuration credentials
   GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="your_google_client_secret"
   GOOGLE_CALLBACK_URI="http://localhost:3000/api/auth/google/callback"

   # WebAuthn settings (frontend origin parameters)
   FRONTEND_ORIGIN="http://localhost:5173"
   RP_ID="localhost"
   RP_NAME="DriveSync"

   # SMTP settings for notification alerts (e.g. ethereal.email or Gmail)
   SMTP_HOST="smtp.ethereal.email"
   SMTP_PORT=587
   SMTP_USER="your-smtp-username"
   SMTP_PASS="your-smtp-password"
   CLIENT_URL="http://localhost:5173"
   ```
3. Push schemas to sync PostgreSQL database with Prisma models:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
4. Run server dev runner:
   ```bash
   npm run dev
   ```
   The backend server runs on `http://localhost:3000`.

### 3. Frontend App Configuration
1. Open a new shell console and enter the client directory:
   ```bash
   cd frontend
   ```
2. Install client dependencies:
   ```bash
   npm install
   ```
3. Establish your environment files `.env.local`:
   ```env
   VITE_API_URL=http://localhost:3000/api
   # If configuring Google Client auth login
   VITE_GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
   ```
4. Boot up local Vite dev engine:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173`.

---

## 🛡️ Database Constraints & Security Design

To prevent collisions and handle deep hierarchies safely, several core logic patterns are configured:
*   **Duplicate File/Folder Names:** The Prisma model contains a joint index rule `@@unique([name, parentId/folderId, userId])`. This database check blocks users from creating folders or saving files with matching names inside the same directory level, maintaining folder layout reliability.
*   **Cascade Delete Integrity:** Database structures are set up with `@relation(onDelete: Cascade)` rules. When a parent folder is deleted permanently, Prisma and PostgreSQL handle cleaning up all subfolders, file items, shared records, and credential models immediately to prevent orphaned rows.
*   **Recursive Trash Filters:** Directory controllers recursively trace parent trash configurations to hide files situated under trashed folders when performing queries, preventing users from seeing files whose parent directories are currently trashed.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for more information.
