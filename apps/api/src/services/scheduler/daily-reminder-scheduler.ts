import type { FastifyBaseLogger } from "fastify";
import { dateInTimeZone } from "../../utils/dates.js";
import type {
  DailyWorkoutJob,
  OwnerLookup
} from "./daily-workout-job.js";

function timeInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

export class DailyReminderScheduler {
  private interval: NodeJS.Timeout | null = null;
  private lastRunDate: string | null = null;
  private running = false;

  constructor(
    private readonly job: DailyWorkoutJob,
    private readonly options: {
      owner: OwnerLookup;
      timezone: string;
      sendTime: string;
      logger: FastifyBaseLogger;
    }
  ) {}

  start() {
    if (this.interval) {
      return;
    }

    this.interval = setInterval(() => {
      void this.tick();
    }, 60_000);

    void this.tick();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async tick(now = new Date()) {
    const localDate = dateInTimeZone(now, this.options.timezone);
    if (
      this.running ||
      this.lastRunDate === localDate ||
      timeInTimeZone(now, this.options.timezone) !== this.options.sendTime
    ) {
      return;
    }

    this.running = true;
    try {
      const result = await this.job.run(this.options.owner);
      this.lastRunDate = localDate;
      this.options.logger.info({ result }, "Daily workout reminder processed");
    } catch (error) {
      this.options.logger.error(error, "Daily workout reminder failed");
    } finally {
      this.running = false;
    }
  }
}
