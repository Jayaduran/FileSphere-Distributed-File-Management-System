# FileSphere — Frontend

A React frontend for a cloud storage app: login, signup, a file dashboard,
and account settings. No backend is wired in yet — every list starts empty
and every form action has a clearly marked `TODO` where you plug in your
own API calls.

## Run it

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173).

## Structure

```
src/
  components/   Icon, Sidebar, Topbar, EmptyState — shared UI pieces
  context/      AuthContext + FilesContext (app state), and their hooks
  pages/        Login, Signup, Dashboard, Settings
  index.css     all styling — color/type tokens at the top of the file
```

## Where to plug in your backend

- `src/context/AuthContext.jsx` — `login()` and `signup()` currently throw
  a "not connected" error. Replace the body with real `fetch`/axios calls
  to your auth endpoints, and call `setUser(...)` with the response.
- `src/context/FilesContext.jsx` — `fetchFiles()`, `uploadFile()`,
  `toggleStar()`, and `moveToTrash()` are stubs. Wire each to your
  files/S3 API.
- `src/pages/Settings.jsx` — `handleUpdateCredentials`,
  `toggleNotification`, and `handleDeleteAccount` log to the console where
  a real request should go.

No dummy users, files, or sessions are hardcoded anywhere — every screen
shows its real empty state until your backend supplies data.
