import React from 'react';
import { LegalDoc } from '@/components/legal/LegalDoc';

export default function PrivacyScreen() {
  return (
    <LegalDoc
      title="Privacy Policy"
      updated="June 2026"
      intro="Aboy AI ('we', 'us') is an educational AI platform for healthcare students and professionals. This policy explains what we collect, how we use it, and your rights. By using Aboy AI you agree to this policy."
      sections={[
        {
          heading: '1. What we collect',
          body:
            'We collect: your name and email; your role, institution, course/department, year and country; the questions you ask and the AI responses (your chat history); voice recordings you make for voice features (processed to text); and your learning progress (topics studied, strengths and weak areas). We also collect basic device and usage information needed to run the app.',
        },
        {
          heading: '2. How we use your data',
          body:
            'Your data is used to: personalise responses to your exact role and level; maintain your chat history so you can continue conversations; track your learning progress; improve the platform’s accuracy and safety; and perform safety monitoring (e.g. flagging emergency or unsafe queries). We do not sell your personal data.',
        },
        {
          heading: '3. Who can see your data',
          body:
            'Your conversations and profile are private to you. The only other parties who may access them are Aboy AI administrators, and only for safety review, abuse prevention, or when required by law. Other users can never see your data.',
        },
        {
          heading: '4. Voice recordings',
          body:
            'Voice input is converted to text to answer your question. Recordings are processed for transcription and the resulting text is stored as part of your chat history. You can use the app entirely by typing if you prefer not to use voice.',
        },
        {
          heading: '5. Healthcare data disclaimer',
          body:
            'Aboy AI is an EDUCATIONAL TOOL, not a medical device. It does not diagnose, treat, or prescribe, and it is not a substitute for professional clinical judgment, supervision, or institutional protocols. Do not enter identifiable patient information. Always verify clinical decisions against current guidelines and your supervisors.',
        },
        {
          heading: '6. Student data protection',
          body:
            'We treat student data with particular care. Your academic details (institution, course, year) are used only to tailor educational content and are never shared with third parties for marketing. Learning progress is visible only to you.',
        },
        {
          heading: '7. Data retention & deletion',
          body:
            'We keep your data while your account is active. You can request deletion of your account and all associated data (profile, chat history, voice transcripts, learning progress) at any time by emailing the address below. We will action verified deletion requests promptly and permanently.',
        },
        {
          heading: '8. Security',
          body:
            'Data is stored with our infrastructure providers (Supabase) using encryption in transit and access controls. While we take reasonable measures to protect your data, no system is perfectly secure.',
        },
        {
          heading: '9. Contact',
          body:
            'For privacy questions or data deletion requests, contact: daniel11dst@gmail.com.',
        },
      ]}
    />
  );
}
