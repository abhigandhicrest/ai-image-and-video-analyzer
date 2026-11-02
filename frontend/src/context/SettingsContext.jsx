// Shares saved thresholds and the API base URL with every page.
import { createContext, useContext, useMemo, useState } from "react";

import { defaultSettings, loadSettings, saveSettings } from "../services/settings";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  // Read localStorage once. Later updates go through updateSettings.
  const [settings, setSettings] = useState(() => loadSettings());

  const value = useMemo(
    () => ({
      settings,
      defaults: defaultSettings,
      updateSettings: (next) => {
        const saved = saveSettings(next);
        setSettings(saved);
        return saved;
      },
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}
