import { useAuth } from './AuthContext';

/** Freya (INS / module fields) is stored on the user account; toggle lives on Account. */
export function useFreyaMode() {
  const { freyaEnabled, setFreyaEnabled } = useAuth();
  return {
    freya: freyaEnabled,
    setFreya: setFreyaEnabled,
  };
}
