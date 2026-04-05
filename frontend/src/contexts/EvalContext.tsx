import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';
import type { EvalJobStatus, EvalUsageEstimate } from '../types';
import { useAuth } from './AuthContext';

interface EvalJob {
  bugId: string;
  question: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  elapsed: number;
  result: EvalJobStatus['result'];
  error: string | null;
  estimate: EvalUsageEstimate | null;
  usageActual: EvalUsageEstimate | null;
}

interface EvalContextValue {
  jobs: EvalJob[];
  startEval: (bugId: string, question: string, modelOverride?: string) => void;
  isRunning: (bugId: string) => boolean;
  clearJob: (bugId: string) => void;
}

const EvalCtx = createContext<EvalContextValue>({
  jobs: [],
  startEval: () => {},
  isRunning: () => false,
  clearJob: () => {},
});

export function useEvalContext() {
  return useContext(EvalCtx);
}

const POLL_INTERVAL = 2000;
const COMPLETED_DISPLAY_MS = 15000;

export function EvalProvider({ children }: { children: ReactNode }) {
  const { preferredModel } = useAuth();
  const [jobs, setJobs] = useState<EvalJob[]>([]);
  const jobsRef = useRef<EvalJob[]>([]);
  jobsRef.current = jobs;
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const timerRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const clearPoll = useCallback((bugId: string) => {
    if (pollRefs.current[bugId]) {
      clearInterval(pollRefs.current[bugId]);
      delete pollRefs.current[bugId];
    }
  }, []);

  const clearTimer = useCallback((bugId: string) => {
    if (timerRefs.current[bugId]) {
      clearInterval(timerRefs.current[bugId]);
      delete timerRefs.current[bugId];
    }
  }, []);

  const clearJob = useCallback(
    (bugId: string) => {
      clearPoll(bugId);
      clearTimer(bugId);
      setJobs((prev) => prev.filter((j) => j.bugId !== bugId));
    },
    [clearPoll, clearTimer],
  );

  const startEval = useCallback(
    (bugId: string, question: string, modelOverride?: string) => {
      if (jobsRef.current.some((j) => j.bugId === bugId && j.status === 'running')) return;

      clearJob(bugId);

      const newJob: EvalJob = {
        bugId,
        question,
        status: 'running',
        startedAt: Date.now(),
        elapsed: 0,
        result: null,
        error: null,
        estimate: null,
        usageActual: null,
      };
      setJobs((prev) => [...prev.filter((j) => j.bugId !== bugId), newJob]);

      const model = modelOverride || preferredModel;

      api
        .startEvaluation(bugId, { model })
        .then((initial) => {
          if (initial.estimate) {
            setJobs((prev) =>
              prev.map((j) =>
                j.bugId === bugId ? { ...j, estimate: initial.estimate ?? null } : j,
              ),
            );
          }
        })
        .catch(() => {});

      timerRefs.current[bugId] = setInterval(() => {
        setJobs((prev) =>
          prev.map((j) =>
            j.bugId === bugId && j.status === 'running'
              ? { ...j, elapsed: Math.floor((Date.now() - j.startedAt) / 1000) }
              : j,
          ),
        );
      }, 1000);

      pollRefs.current[bugId] = setInterval(async () => {
        try {
          const status = await api.getEvalStatus(bugId);
          if (status.status === 'running' || status.status === 'completed' || status.status === 'failed') {
            if (status.estimate) {
              setJobs((prev) =>
                prev.map((j) =>
                  j.bugId === bugId ? { ...j, estimate: status.estimate ?? j.estimate } : j,
                ),
              );
            }
          }
          if (status.status === 'completed') {
            clearPoll(bugId);
            clearTimer(bugId);
            setJobs((prev) =>
              prev.map((j) =>
                j.bugId === bugId
                  ? {
                      ...j,
                      status: 'completed',
                      elapsed: Math.floor((Date.now() - j.startedAt) / 1000),
                      result: status.result,
                      usageActual: status.usage_actual ?? j.estimate,
                      estimate: status.estimate ?? j.estimate,
                    }
                  : j,
              ),
            );
            setTimeout(() => clearJob(bugId), COMPLETED_DISPLAY_MS);
          } else if (status.status === 'failed') {
            clearPoll(bugId);
            clearTimer(bugId);
            setJobs((prev) =>
              prev.map((j) =>
                j.bugId === bugId
                  ? {
                      ...j,
                      status: 'failed',
                      elapsed: Math.floor((Date.now() - j.startedAt) / 1000),
                      error: status.error,
                    }
                  : j,
              ),
            );
            setTimeout(() => clearJob(bugId), COMPLETED_DISPLAY_MS);
          }
        } catch {
          // network error, keep polling
        }
      }, POLL_INTERVAL);
    },
    [preferredModel, clearJob, clearPoll, clearTimer],
  );

  const isRunning = useCallback(
    (bugId: string) => jobs.some((j) => j.bugId === bugId && j.status === 'running'),
    [jobs],
  );

  useEffect(() => {
    return () => {
      Object.keys(pollRefs.current).forEach((k) => clearInterval(pollRefs.current[k]));
      Object.keys(timerRefs.current).forEach((k) => clearInterval(timerRefs.current[k]));
    };
  }, []);

  return <EvalCtx.Provider value={{ jobs, startEval, isRunning, clearJob }}>{children}</EvalCtx.Provider>;
}
