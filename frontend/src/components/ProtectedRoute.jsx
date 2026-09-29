import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import AuthStatus from "./AuthStatus";

const ProtectedRoute = ({ children }) => {
  const { user, loading, error } = useAuth();

  if (loading || error) return <AuthStatus />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
