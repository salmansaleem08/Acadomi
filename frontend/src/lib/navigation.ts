/** Platform areas — aligns with Acadomi FYP feature set (routes to be implemented). */
export const platformNav = {
  learn: [
    { href: "/upload", label: "Uploads & content" },
    { href: "/tutor", label: "AI tutor (Meet-style)" },
    { href: "/group-study", label: "Group learning" },
    { href: "/debate", label: "AI debate" },
  ],
  study: [
    { href: "/bookmarks", label: "Bookmarks & recaps" },
    { href: "/eli5", label: "Explain like I'm 5" },
    { href: "/cheat-sheets", label: "Smart cheat sheets" },
    { href: "/rewind-quiz", label: "Rewind & quiz" },
  ],
  engagement: [
    { href: "/focus", label: "Focus detection" },
    { href: "/teach-ai", label: "Teach the AI" },
    { href: "/podcast", label: "Podcast mode" },
    { href: "/role-reversal", label: "Role reversal teaching" },
  ],
  social: [{ href: "/friends", label: "Friends & study buddies" }],
} as const;

export const mainNav = [
  { href: "/", label: "Home" },
  { href: "/friends", label: "Friends" },
] as const;
