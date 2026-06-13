import React from 'react';
import { LegalDoc } from '@/components/legal/LegalDoc';

export default function TermsScreen() {
  return (
    <LegalDoc
      title="Terms & Conditions"
      updated="June 2026"
      intro="These Terms govern your use of Aboy AI. By creating an account or using the app, you agree to them. If you do not agree, do not use the app."
      sections={[
        {
          heading: '1. Educational purpose only',
          body:
            'Aboy AI is provided strictly for education and study support. It is NOT a substitute for clinical judgment, professional medical advice, diagnosis, treatment, or your institution’s protocols and supervision. You must independently verify any information before applying it in practice. Aboy AI is not a medical device.',
        },
        {
          heading: '2. Eligibility',
          body:
            'Aboy AI is intended for healthcare students and qualified or training healthcare professionals and educators. By using the app you confirm you fall within one of these groups. Roles may be reviewed by an administrator.',
        },
        {
          heading: '3. Acceptable use — no misuse',
          body:
            'You agree not to: enter identifiable patient data; use Aboy AI to make unsupervised clinical decisions; attempt to obtain advice for self-harm or to harm others; misrepresent your role; share your account; reverse-engineer, overload, or abuse the service; or use it for any unlawful purpose. We may suspend accounts that misuse the platform.',
        },
        {
          heading: '4. No clinical liability',
          body:
            'Information may be incomplete, outdated, or incorrect. To the maximum extent permitted by law, Aboy AI and its creators accept no liability for any decision, action, or outcome arising from use of the app. You use it at your own risk and remain fully responsible for your clinical practice.',
        },
        {
          heading: '5. Your content',
          body:
            'You retain ownership of the questions you submit. You grant us a limited licence to process them to provide and improve the service and to perform safety monitoring, as described in the Privacy Policy.',
        },
        {
          heading: '6. Availability & changes',
          body:
            'We may update, suspend, or discontinue features at any time. We may revise these Terms; continued use after changes means you accept the updated Terms.',
        },
        {
          heading: '7. Contact',
          body: 'Questions about these Terms: daniel11dst@gmail.com.',
        },
      ]}
    />
  );
}
