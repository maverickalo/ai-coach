import { chromium, devices } from "@playwright/test";

const workout = {
  id: "workout-1",
  name: "Lower Body Strength",
  focus: "Heavy lower-body strength and HYROX durability",
  estimatedMinutes: 60,
  scheduledDate: "2026-06-27",
  status: "scheduled",
  exercises: [
    ["Back Squat", 5, "8"],
    ["Romanian Deadlift", 4, "10"],
    ["Reverse Lunge", 3, "12 each leg"],
    ["Box Step-Up", 3, "15 each leg"]
  ].map(([name, sets, reps], index) => ({
    templateExerciseId: `template-${index}`,
    sortOrder: index + 1,
    prescribedSets: sets,
    prescribedReps: reps,
    prescribedWeight: null,
    notes: null,
    exercise: {
      id: `exercise-${index}`,
      name,
      category: "strength"
    }
  }))
};

const messages = [
  {
    id: "message-1",
    role: "coach",
    body: "Morning Sean. Lower Body Strength is ready. Keep the first squat sets crisp and send me the numbers when you're done.",
    createdAt: new Date().toISOString()
  },
  {
    id: "message-2",
    role: "user",
    body: "Feeling good. Starting now.",
    createdAt: new Date().toISOString()
  }
];

const workouts = [
  {
    id: "history-1",
    scheduledDate: "2026-06-26",
    name: "Full Body Strength",
    status: "completed",
    exercisesLogged: 8,
    coachSummary: "Strong session. Bench moved well and wall ball pacing stayed consistent."
  },
  {
    id: "history-2",
    scheduledDate: "2026-06-24",
    name: "Upper Volume",
    status: "partially_completed",
    exercisesLogged: 6,
    coachSummary: "Good pressing volume. Rear delts were skipped because of time."
  },
  {
    id: "history-3",
    scheduledDate: "2026-06-23",
    name: "Lower Volume",
    status: "completed",
    exercisesLogged: 8,
    coachSummary: null
  }
];

const profile = {
  displayName: "Sean",
  timezone: "America/Los_Angeles",
  phoneNumber: "+12065551234",
  email: "sean@example.com",
  primaryGoal: "HYROX training with high-rep strength work",
  equipmentNotes: "Rep Aries rack, dumbbells, barbell, landmine, cables, rower, bike, and treadmill.",
  injuryNotes: "Monitor wrist discomfort during heavy pressing."
};

async function mockApi(page) {
  await page.route("http://127.0.0.1:3001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/today") {
      return route.fulfill({ json: workout });
    }
    if (path === "/messages") {
      return route.fulfill({ json: messages });
    }
    if (path === "/chat") {
      return route.fulfill({
        json: {
          reply: "Logged. Tell me the top set weight and RPE when you finish."
        }
      });
    }
    if (path === "/workouts") {
      return route.fulfill({ json: workouts });
    }
    if (path === "/profile") {
      return route.fulfill({ json: profile });
    }

    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
}

const browser = await chromium.launch({ headless: true });

const mobile = await browser.newContext({
  ...devices["iPhone 13"],
  colorScheme: "dark"
});
const mobilePage = await mobile.newPage();
await mockApi(mobilePage);
await mobilePage.goto("http://localhost:3000/login");
await mobilePage.waitForSelector(".login-form");
await mobilePage.screenshot({
  path: "/tmp/coach-ai-mobile-login.png",
  fullPage: false
});

await mobilePage.goto("http://localhost:3000/coach");
await mobilePage.waitForSelector(".workout-card h2");
await mobilePage.screenshot({
  path: "/tmp/coach-ai-mobile-coach.png",
  fullPage: false
});

const mobileMetrics = await mobilePage.evaluate(() => {
  const composer = document.querySelector(".chat-composer")?.getBoundingClientRect();
  const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
  return {
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    composerBottom: composer?.bottom,
    navTop: nav?.top,
    composerVisible: Boolean(composer && composer.top >= 0),
    navVisible: Boolean(nav && nav.top < window.innerHeight)
  };
});

await mobilePage.getByRole("button", { name: "Done" }).click();
await mobilePage.waitForSelector(
  'article[aria-label="Coach message"]:has-text("top set weight")'
);
await mobilePage.screenshot({
  path: "/tmp/coach-ai-mobile-chat.png",
  fullPage: false
});

await mobilePage.goto("http://localhost:3000/workouts");
await mobilePage.waitForSelector(".history-card");
await mobilePage.screenshot({
  path: "/tmp/coach-ai-mobile-workouts.png",
  fullPage: false
});

await mobilePage.goto("http://localhost:3000/settings");
await mobilePage.waitForSelector(".settings-form");
await mobilePage.screenshot({
  path: "/tmp/coach-ai-mobile-settings.png",
  fullPage: false
});

const desktop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  colorScheme: "dark"
});
const desktopPage = await desktop.newPage();
await mockApi(desktopPage);
await desktopPage.goto("http://localhost:3000/coach");
await desktopPage.waitForSelector(".workout-card h2");
await desktopPage.screenshot({
  path: "/tmp/coach-ai-desktop-coach.png",
  fullPage: false
});

console.log(JSON.stringify(mobileMetrics));
await browser.close();
