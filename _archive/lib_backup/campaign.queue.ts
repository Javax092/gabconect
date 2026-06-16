import { Queue } from "bullmq";
import { connection } from "../redis";

export const campaignQueue = new Queue("campaign", {
  connection,
});
