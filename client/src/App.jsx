import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';

// Temporary landing page behind login. Replaced by the chat page in step 4.
function Home() {
  const { user, logout } = useAuth();
  return (
    <div className="center-screen">
      <div className="auth-card">
        <h1>Welcome, {user.username}</h1>
        <p className="muted">You are logged in. The chat arrives in later steps.</p>
        <button onClick={logout}>Log out</button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
