import axios from 'axios';

const MAIN_API = import.meta.env.VITE_MAIN_API || '';

export interface HelpFeedbackPayload {
  slug: string;
  helpful: boolean;
  turnstileToken: string;
}

export async function submitHelpFeedback(
  payload: HelpFeedbackPayload,
): Promise<void> {
  await axios.post(`${MAIN_API}/api/help/feedback`, payload, {
    timeout: 15000,
  });
}
