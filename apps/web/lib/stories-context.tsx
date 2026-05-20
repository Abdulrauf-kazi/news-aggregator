import { createContext, useContext, useState, type ReactNode } from "react";
import type { StoryNode } from "../lib/graph";

type StoriesContextType = {
  stories: StoryNode[];
  setStories: (stories: StoryNode[]) => void;
};

const StoriesContext = createContext<StoriesContextType | null>(null);

export function StoriesProvider({ children }: { children: ReactNode }) {
  const [stories, setStories] = useState<StoryNode[]>([]);

  return (
    <StoriesContext.Provider value={{ stories, setStories }}>
      {children}
    </StoriesContext.Provider>
  );
}

export function useStories() {
  const ctx = useContext(StoriesContext);
  if (!ctx) {
    throw new Error("useStories must be used within StoriesProvider");
  }
  return ctx;
}
