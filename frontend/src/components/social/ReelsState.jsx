import { createContext, useContext, useMemo, useRef, useState } from "react";

const ReelsStateContext = createContext(null);

export function ReelsStateProvider({ children }) {
  const [reels, setReels] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const playersRef = useRef(new Map());
  const value = useMemo(() => ({
    reels,
    setReels,
    currentIndex,
    setCurrentIndex,
    playersRef,
  }), [currentIndex, reels]);

  return <ReelsStateContext.Provider value={value}>{children}</ReelsStateContext.Provider>;
}

export function useReelsState() {
  const state = useContext(ReelsStateContext);
  if (!state) throw new Error("useReelsState must be used inside ReelsStateProvider.");
  return state;
}
