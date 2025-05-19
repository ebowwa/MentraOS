import { Resend } from 'resend';

/**
 * Email service using Resend API for sending transactional emails
 */
export class ResendEmailService {
  private resend: Resend;
  private defaultSender: string;

  /**
   * Initializes the Resend email service
   * @throws Error if RESEND_API_KEY is not defined in environment variables
   */
  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not defined in environment variables');
    }
    this.resend = new Resend(apiKey);
    this.defaultSender = process.env.EMAIL_SENDER || 'AugmentOS <noreply@augmentos.org>';
  }

  /**
   * Sends an organization invitation email
   * @param recipientEmail - Email address of the invitee
   * @param inviterName - Name of the person sending the invitation
   * @param organizationName - Name of the organization
   * @param inviteToken - JWT token for accepting the invitation
   * @param role - Role assigned to the invitee
   * @returns Promise with the result of the email sending operation
   */
  async sendOrganizationInvite(
    recipientEmail: string,
    inviterName: string,
    organizationName: string,
    inviteToken: string,
    role: string
  ): Promise<{ id?: string; error?: any }> {
    const inviteUrl = `${process.env.FRONTEND_URL || 'https://console.augmentos.org'}/invite/accept?token=${inviteToken}`;

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.defaultSender,
        to: [recipientEmail],
        subject: `You've been invited to join ${organizationName} on AugmentOS Developer Console`,
        html: this.generateInviteEmailHtml(inviterName, organizationName, inviteUrl, role),
      });

      if (error) {
        console.error('Failed to send invitation email:', error);
        return { error };
      }

      return { id: data?.id };
    } catch (error) {
      console.error('Error sending invitation email:', error);
      return { error };
    }
  }

  /**
   * Generates HTML content for organization invitation emails
   * @private
   */
  private generateInviteEmailHtml(
    inviterName: string,
    organizationName: string,
    inviteUrl: string,
    role: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Organization Invitation</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { max-width: 150px; margin-bottom: 20px; }
            .button { display: inline-block; background-color: #4a86e8; color: white; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold; margin: 20px 0; }
            .footer { margin-top: 40px; font-size: 12px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>You've Been Invited!</h1>
          </div>

          <p>Hello,</p>

          <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <strong>${role}</strong> on the AugmentOS Developer Console.</p>

          <p>As a member of this organization, you'll have access to all the applications and resources shared by the team.</p>

          <p style="text-align: center;">
            <a href="${inviteUrl}" class="button">Accept Invitation</a>
          </p>

          <p><small>This invitation link will expire in 7 days.</small></p>

          <p>If you didn't expect this invitation or have any questions, please contact ${inviterName}.</p>

        </body>
      </html>
    `;
  }
}

// Create singleton instance
export const emailService = new ResendEmailService();
