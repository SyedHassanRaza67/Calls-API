import React, { createContext, useContext, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

type ViewMode = "agent" | "admin";

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const [viewMode, setViewModeRaw] = useState<ViewMode>("agent");

  // Default admins into "admin" view as soon as their role resolves.
  React.useEffect(() => {
    if (isAdmin) {
      setViewModeRaw("admin");
    } else {
      setViewModeRaw("agent");
    }
  }, [isAdmin]);

  // Guard: only real admins can switch to "admin" view. Non-admins are forced to "agent".
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      if (mode === "admin" && !isAdmin) {
        setViewModeRaw("agent");
        return;
      }
      setViewModeRaw(mode);
    },
    [isAdmin]
  );

  const toggleViewMode = useCallback(() => {
    setViewModeRaw((prev) => {
      if (prev === "agent") {
        return isAdmin ? "admin" : "agent";
      }
      return "agent";
    });
  }, [isAdmin]);

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode, toggleViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error("useViewMode must be used within a ViewModeProvider");
  }
  return context;
}
