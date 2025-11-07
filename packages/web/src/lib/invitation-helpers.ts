/**
 * Generates consistent invitation status messages for toasts
 * @param emailSent - Whether the email was successfully sent
 * @param email - The recipient's email address
 * @param action - Whether this is a new invitation ('created') or resending ('resent')
 * @returns Object with title and description for toast notification
 */
export function getInvitationStatusMessage(
  emailSent: boolean,
  email: string,
  action: 'created' | 'resent'
): { title: string; description: string } {
  if (emailSent) {
    const actionText = action === 'resent' ? 'resent to' : 'sent to';
    return {
      title: 'Success',
      description: `Invitation email ${actionText} ${email}`
    };
  } else {
    const failureAction = action === 'resent' ? 'extended' : 'created';
    return {
      title: action === 'created' ? 'Invitation Created' : 'Success',
      description: `Invitation ${failureAction} for ${email} - email delivery failed. Use the copy link button to share manually.`
    };
  }
}
