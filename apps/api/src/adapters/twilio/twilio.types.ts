export interface TwilioInboundBody {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  [key: string]: string;
}
