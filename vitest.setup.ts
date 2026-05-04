// Tells React this is an environment where act() is required;
// makes useEffect / state updates flush synchronously in @testing-library/react v16.
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Stubs for @vitejs/plugin-react's React Refresh globals — not injected in test mode.
;(globalThis as any).$RefreshReg$ = () => {};
;(globalThis as any).$RefreshSig$ = () => (type: unknown) => type;
