// services/client/feedback.service.ts
// Business logic for managing user feedback

import { Feedback } from "../../models/feedback.model";
import { emailService } from "../email/resend.service";

const ADMIN_EMAILS = process.env.ADMIN_EMAILS || "isaiah@mentra.glass";
const admins = [...ADMIN_EMAILS.split(",").map(e => e.trim())]

/**
 * Submit user feedback.
 */
export async function submitFeedback(email: string, feedback: string) {
  // Save feedback to database.
  const newFeedback = await Feedback.create({
    email,
    feedback,
  });

  // Submit feedback to admin emails using mail service.
  await emailService.sendFeedback(email, feedback, admins);

  // TODO(isaiah): Consider also sending feedback to a Slack channel.
  return newFeedback;
}

