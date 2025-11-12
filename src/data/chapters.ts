export type EntryType = "milestone" | "memory" | "story";

export type ChapterEntry = {
  id: string;
  title: string;
  dateLabel: string;
  type: EntryType;
  summary: string;
};

export type Chapter = {
  id: string;
  number: number;
  title: string;
  period: string;
  summary: string;
  entries: ChapterEntry[];
};

// TODO(db): replace CHAPTERS_TEMP with data from the real biography API.
export const CHAPTERS_TEMP: Chapter[] = [
  {
    id: "early-years",
    number: 1,
    title: "Early Years",
    period: "1990 – 1995",
    summary: "Roots, rituals, and the first sparks of curiosity.",
    entries: [
      {
        id: "backyard-observatory",
        title: "Backyard Observatory",
        dateLabel: "Aug 12, 1991",
        type: "milestone",
        summary:
          "Built a cardboard telescope with Dad and logged the first constellation sightings.",
      },
      {
        id: "grandma-journal",
        title: "Grandma's Journal",
        dateLabel: "Winter 1992",
        type: "memory",
        summary:
          "Received a blank journal and a prompt to record one question per day.",
      },
    ],
  },
  {
    id: "school-days",
    number: 2,
    title: "School Days",
    period: "1995 – 2008",
    summary: "Learning to translate ideas into teams, clubs, and experiments.",
    entries: [
      {
        id: "science-fair",
        title: "Science Fair Victory",
        dateLabel: "Mar 2003",
        type: "milestone",
        summary: "Won with a project linking storytelling to memory retention.",
      },
      {
        id: "radio-club",
        title: "Lunchtime Radio Club",
        dateLabel: "Fall 2005",
        type: "story",
        summary:
          "Produced a weekly show, interviewing classmates about moments that shaped them.",
      },
      {
        id: "best-friend-letter",
        title: "Letter to a Best Friend",
        dateLabel: "June 2007",
        type: "memory",
        summary: "Captured a friendship at the exact moment our paths diverged.",
      },
    ],
  },
  {
    id: "coming-of-age",
    number: 3,
    title: "Coming of Age",
    period: "2008 – 2014",
    summary: "First independent pursuits and the decision to study narrative design.",
    entries: [
      {
        id: "city-move",
        title: "First Apartment in the City",
        dateLabel: "Sept 2009",
        type: "milestone",
        summary: "Shared studio with three roommates and four buzzing projects.",
      },
      {
        id: "campus-interviews",
        title: "Campus Interview Series",
        dateLabel: "2011",
        type: "story",
        summary:
          "Interviewed strangers about pivotal moments. Learned how to hold silence.",
      },
      {
        id: "founding-pitch",
        title: "First Founding Pitch",
        dateLabel: "May 2013",
        type: "milestone",
        summary:
          "Pitched a storytelling OS for teams; the rejection letter lives in the archive.",
      },
    ],
  },
  {
    id: "early-career",
    number: 4,
    title: "Early Career",
    period: "2014 – 2018",
    summary: "First teams, first launches, and learning to lead without ego.",
    entries: [
      {
        id: "product-fellowship",
        title: "Product Fellowship",
        dateLabel: "2014 – 2015",
        type: "memory",
        summary:
          "Shadowed veteran PMs to understand how stories shape every roadmap decision.",
      },
      {
        id: "launch-week",
        title: "First Launch Week",
        dateLabel: "Jan 2016",
        type: "milestone",
        summary: "Shipped a messaging product and built the narrative playbook overnight.",
      },
      {
        id: "team-retreat",
        title: "Team Retreat",
        dateLabel: "Aug 2017",
        type: "story",
        summary:
          "Facilitated a retreat that surfaced buried tensions and reset how we worked together.",
      },
    ],
  },
  {
    id: "scale-up",
    number: 5,
    title: "Scale Up",
    period: "2019 – 2021",
    summary: "Scaling teams, guiding multi-region launches, and refining leadership voices.",
    entries: [
      {
        id: "international-rollout",
        title: "International Rollout",
        dateLabel: "April 2019",
        type: "milestone",
        summary: "Coordinated launch stories across five regions with a single narrative spine.",
      },
      {
        id: "executive-briefings",
        title: "Executive Briefings",
        dateLabel: "2020",
        type: "story",
        summary:
          "Designed briefing rituals that helped execs translate data into memorable anecdotes.",
      },
      {
        id: "remote-pivot",
        title: "Remote Pivot",
        dateLabel: "May 2020",
        type: "memory",
        summary:
          "Led the storytelling shift when the entire org moved remote during the pandemic.",
      },
    ],
  },
  {
    id: "biography-build",
    number: 6,
    title: "Biography Build",
    period: "2022 – Present",
    summary: "Focusing on Biography, partnering with founders, and experimenting with AI prompts.",
    entries: [
      {
        id: "alpha-cohort",
        title: "Alpha Cohort",
        dateLabel: "June 2022",
        type: "milestone",
        summary: "Onboarded the first storytellers and captured their feedback loops.",
      },
      {
        id: "ai-prototype",
        title: "AI Prompt Prototype",
        dateLabel: "Jan 2023",
        type: "memory",
        summary: "Built a question engine to interview people about pivotal memories.",
      },
      {
        id: "studio-collab",
        title: "Studio Collaboration",
        dateLabel: "2024",
        type: "story",
        summary:
          "Partnered with a creative studio to explore how Biography could power live events.",
      },
    ],
  },
  {
    id: "mentor-season",
    number: 7,
    title: "Mentor Season",
    period: "2023 – 2024",
    summary: "Advising founders and sharing playbooks about narrative-led product strategy.",
    entries: [
      {
        id: "office-hours",
        title: "Weekly Office Hours",
        dateLabel: "Spring 2023",
        type: "memory",
        summary:
          "Hosted open sessions for builders to pressure-test positioning, prompts, and story arcs.",
      },
      {
        id: "sparring-tour",
        title: "Product Sparring Tour",
        dateLabel: "Fall 2023",
        type: "story",
        summary: "Traveled to four cities to work shoulder-to-shoulder with early teams for a week each.",
      },
      {
        id: "mentor-roster",
        title: "Mentor Roster",
        dateLabel: "Jan 2024",
        type: "milestone",
        summary: "Formalized an advisory program tying each mentor to chapters inside Biography.",
      },
    ],
  },
  {
    id: "story-lab",
    number: 8,
    title: "Story Lab",
    period: "2024",
    summary: "Experimenting with multimedia ways of capturing memories beyond text.",
    entries: [
      {
        id: "audio-vault",
        title: "Audio Vault",
        dateLabel: "Feb 2024",
        type: "milestone",
        summary: "Launched voice capture that automatically tags emotions and people mentioned.",
      },
      {
        id: "memory-palette",
        title: "Memory Palette",
        dateLabel: "May 2024",
        type: "story",
        summary: "Prototyped a UI for pairing colors with autobiographical memories to show mood shifts.",
      },
      {
        id: "cues-library",
        title: "Cue Library",
        dateLabel: "Aug 2024",
        type: "memory",
        summary: "Collected hundreds of prompts from users and turned them into a searchable set.",
      },
    ],
  },
  {
    id: "partnerships",
    number: 9,
    title: "Partnership Chapters",
    period: "2024 – 2025",
    summary: "Collaborating with institutions that want to preserve collective memories.",
    entries: [
      {
        id: "museum-residency",
        title: "Museum Residency",
        dateLabel: "Oct 2024",
        type: "story",
        summary: "Worked with a museum to archive oral histories from their community volunteers.",
      },
      {
        id: "university-studio",
        title: "University Studio",
        dateLabel: "Jan 2025",
        type: "milestone",
        summary: "Embedded with grad students to co-design curriculum around Biography prompts.",
      },
      {
        id: "collective-memory",
        title: "Collective Memory Paper",
        dateLabel: "Mar 2025",
        type: "memory",
        summary: "Published a whitepaper on how teams can co-author timelines without losing nuance.",
      },
    ],
  },
  {
    id: "future-maps",
    number: 10,
    title: "Future Maps",
    period: "2025+",
    summary: "Designing what comes next: predictive timelines and AI companions.",
    entries: [
      {
        id: "predictive-timeline",
        title: "Predictive Timeline",
        dateLabel: "2025",
        type: "milestone",
        summary: "Drafting a feature that suggests future chapters based on patterns in past entries.",
      },
      {
        id: "companion-agent",
        title: "Companion Agent",
        dateLabel: "In progress",
        type: "story",
        summary: "Exploring a lightweight agent that nudges you to record memories in the moment.",
      },
      {
        id: "open-studio",
        title: "Open Studio Sessions",
        dateLabel: "Upcoming",
        type: "memory",
        summary: "Inviting the community to co-create how Biography should feel in its next era.",
      },
    ],
  },
];
