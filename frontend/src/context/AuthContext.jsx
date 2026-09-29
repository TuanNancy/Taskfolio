/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getMe, logout as logoutApi, advanceSession, onSessionExpired } from "@/services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const sequence = useRef(0);
  const logoutPending = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const controller = new AbortController();
    const version = ++sequence.current;
    getMe(controller.signal).then((data) => {
      if (version === sequence.current) setUser(data.user);
    }).catch((failure) => {
      if (version !== sequence.current) return;
      if (failure.status === 401) setUser(null);
      else setError(failure.message);
    }).finally(() => {
      if (version === sequence.current) setLoading(false);
    });
    return () => { sequence.current += 1; controller.abort(); };
  }, [attempt]);

  useEffect(() => onSessionExpired(() => {
    sequence.current += 1;
    advanceSession();
    queryClient.clear();
    setUser(null);
    setError(null);
    setLoading(false);
  }), [queryClient]);

  const setUserFromAuth = (userData) => {
    sequence.current += 1;
    advanceSession();
    queryClient.clear();
    setUser(userData);
    setError(null);
    setLoading(false);
  };

  const logout = async () => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    const version = sequence.current;
    try {
      await logoutApi();
      if (version === sequence.current) setUserFromAuth(null);
    } finally {
      logoutPending.current = false;
      setLoggingOut(false);
    }
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    setAttempt((value) => value + 1);
  };

  return <AuthContext.Provider value={{ user, loading, error, retry, setUserFromAuth, logout, loggingOut }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
