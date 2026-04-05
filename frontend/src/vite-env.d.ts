/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Production: full API prefix, e.g. ``https://your-api.onrender.com/api``. Omit locally (Vite proxies ``/api``). */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
