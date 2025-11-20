import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  Brain,
  ScrollText,
  BotMessageSquare,
  MicVocal,
} from "lucide-react";

export type BuilderAction = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: "ink" | "plum" | "tide" | "peach";
};

// TODO(db): replace manual and interview data with entries fetched from the service.
export const MANUAL_ACTIONS: BuilderAction[] = [
  {
    id: "milestone",
    title: "Add a Milestone",
    description: "Mark graduations, moves, launches, or other high-signal events.",
    icon: CalendarCheck,
    accent: "tide",
  },
  {
    id: "memory",
    title: "Add a Memory",
    description:
      "Capture the small recollections and textures that give the story its depth.",
    icon: Brain,
    accent: "plum",
  },
  {
    id: "story",
    title: "Add a Story",
    description:
      "Tell a longer narrative with people, places, conflicts, and learnings.",
    icon: ScrollText,
    accent: "ink",
  },
];

export const INTERVIEW_OPTIONS: BuilderAction[] = [
  {
    id: "chat-interview",
    title: "Chat-based interview",
    description: "Answer guided prompts in a focused chat experience.",
    icon: BotMessageSquare,
    accent: "tide",
  },
  {
    id: "voice-interview",
    title: "Voice interview",
    description: "Capture your story through natural conversation.",
    icon: MicVocal,
    accent: "plum",
  },
];
