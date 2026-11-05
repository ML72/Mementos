import React, { useEffect } from 'react';
import { Box, Container, Link, Paper, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import CustomPage from '../../components/layout/CustomPage';

// This page describes what the app really does. When that changes, update it and this date.
const LAST_UPDATED = 'November 5, 2026';
const CONTACT_EMAIL = 'support@mementos.info';

const INK = '#111827';
const BODY = '#374151';
const LINK_SX = { color: '#0A66C2', fontWeight: 500, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } };

const Paragraph: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography sx={{ color: BODY, lineHeight: 1.7, mb: 1.5 }}>{children}</Typography>
);

const Bullets: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box component="ul" sx={{ color: BODY, lineHeight: 1.7, pl: 3, mt: 0, mb: 1.5, '& li': { mb: 0.75 } }}>{children}</Box>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box component="section" sx={{ mt: 4 }}>
    <Typography variant="h3" sx={{ fontSize: '1.15rem', fontWeight: 700, color: INK, mb: 1 }}>{title}</Typography>
    {children}
  </Box>
);

const PartHeading: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <Typography
    id={id}
    variant="h2"
    sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, fontWeight: 800, color: INK, letterSpacing: '-0.5px', mt: 8, scrollMarginTop: '96px' }}
  >
    {children}
  </Typography>
);

const ExternalLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <Link href={href} target="_blank" rel="noopener noreferrer" sx={LINK_SX}>{children}</Link>
);

const ContactLink: React.FC = () => <Link href={`mailto:${CONTACT_EMAIL}`} sx={LINK_SX}>{CONTACT_EMAIL}</Link>;

const TermsOfService: React.FC = () => {
  const { hash } = useLocation();

  // On a direct visit the browser looks for #privacy before this page has downloaded, so the page
  // scrolls there itself. Links here spell out the path because a bare #privacy would resolve
  // against <base href="/"> and leave the page.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <CustomPage showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#ffffff', minHeight: '100vh', pb: 10 }}>
        <Container maxWidth="md" sx={{ pt: { xs: 6, md: 10 } }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '2rem', md: '2.75rem' }, fontWeight: 800, color: INK, letterSpacing: '-1px', mb: 1 }}>
            Terms of Service and Privacy Policy
          </Typography>
          <Typography sx={{ color: '#6B7280', mb: 4 }}>Last updated {LAST_UPDATED}</Typography>

          <Paragraph>
            Mementos ("we" or "us") is a free app for writing notes and having them come back to you over time.
            The Terms of Service cover your use of Mementos, and the Privacy Policy explains what we do with your data.
          </Paragraph>

          <Paper elevation={0} sx={{ p: 3, my: 3, borderRadius: '12px', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
            <Typography sx={{ color: INK, lineHeight: 1.7 }}>
              <Box component="span" sx={{ fontWeight: 700 }}>Notes on Mementos are not private.</Box>{' '}
              Anyone with a Mementos account can read every note you write, so please don't write anything
              you wouldn't want other people to see.
            </Typography>
          </Paper>

          <Typography sx={{ color: BODY }}>
            Jump to the{' '}
            <Link component={RouterLink} to="/terms#terms" sx={LINK_SX}>Terms of Service</Link>
            {' '}or the{' '}
            <Link component={RouterLink} to="/terms#privacy" sx={LINK_SX}>Privacy Policy</Link>.
          </Typography>

          <PartHeading id="terms">Terms of Service</PartHeading>

          <Section title="Accepting these terms">
            <Paragraph>
              By creating an account or using Mementos, you agree to these Terms of Service and to the Privacy
              Policy. If you don't agree, please don't use Mementos.
            </Paragraph>
          </Section>

          <Section title="Your account">
            <Paragraph>
              You must be at least 13 to use Mementos, or older if the law where you live requires it.
            </Paragraph>
            <Paragraph>
              Give us accurate details, and sign up only with an email address that belongs to you. Whoever can
              read the email sent to an address can reset the password of the account registered with it, which
              hands them that account and signs everyone else out. Keep your password safe: you are responsible
              for what happens under your account.
            </Paragraph>
          </Section>

          <Section title="Your notes">
            <Paragraph>
              You keep ownership of what you write. To run Mementos we need your permission to use it, so you give
              us a worldwide, non-exclusive, royalty-free license to store, copy, display and send your notes and
              profile, only to operate and improve Mementos. That covers things like showing your notes to other
              users and putting them in weekly emails. The license ends when you delete the content, apart from
              copies in backups and in emails already sent.
            </Paragraph>
            <Paragraph>
              Only post what you have the right to post. Other users can read your notes, and we can't undo what
              they have already seen or copied. Notes are not end-to-end encrypted, so don't use Mementos to store
              passwords or other sensitive information.
            </Paragraph>
          </Section>

          <Section title="Acceptable use">
            <Paragraph>When using Mementos, please don't:</Paragraph>
            <Bullets>
              <li>break the law, or post anything illegal, threatening, harassing, hateful or sexually explicit</li>
              <li>post someone else's private information without their permission</li>
              <li>infringe anyone's copyright or other rights</li>
              <li>impersonate anyone, or sign up with an address that isn't yours</li>
              <li>send spam or malware</li>
              <li>scrape Mementos or collect other users' data</li>
              <li>get around our security or rate limits, or disrupt the service</li>
            </Bullets>
          </Section>

          <Section title="Moderation">
            <Paragraph>
              We don't review every note, and we aren't responsible for what users post. We may remove content, and
              suspend or close accounts, that break these terms or put Mementos or its users at risk. To report a
              note, including one you believe infringes your copyright, email <ContactLink />.
            </Paragraph>
          </Section>

          <Section title="Emails">
            <Paragraph>
              We send the emails your account needs, such as verification and password reset codes. We also send a
              weekly digest of notes, which is on by default. You can turn it off in Settings or from the link in
              any digest.
            </Paragraph>
          </Section>

          <Section title="Changes to Mementos">
            <Paragraph>
              Mementos is free today. We may add, change or remove features, add paid features, set usage limits, or
              stop running Mementos. We won't charge you unless you choose to pay for something. If we plan to shut
              down, we will try to give you reasonable notice so you can save your notes.
            </Paragraph>
          </Section>

          <Section title="Source code and brand">
            <Paragraph>
              The Mementos source code is licensed under the MIT License. That license covers the code, and these
              terms cover the service we run at mementos.info. Neither gives you the right to use the Mementos name
              or logo as your own brand.
            </Paragraph>
          </Section>

          <Section title="Closing your account">
            <Paragraph>
              You can stop using Mementos at any time, and email us to have your account deleted. We may suspend or
              close your account if you break these terms. Parts of these terms that should last by their nature,
              such as the limit of liability, continue after your account is closed.
            </Paragraph>
          </Section>

          <Section title="No warranty">
            <Paragraph>
              Mementos is provided "as is" and "as available", without warranties of any kind, to the fullest extent
              the law allows. We don't promise that it will always be available or free of errors, that your notes
              will never be lost, or that it will improve your memory. Please keep your own copy of anything important.
            </Paragraph>
          </Section>

          <Section title="Limit of liability">
            <Paragraph>
              To the fullest extent the law allows, we aren't liable for indirect, incidental or consequential
              damages, or for lost data or profits, arising from your use of Mementos. Our total liability for any
              claim is limited to the greater of US$50 and what you paid us in the 12 months before the claim. If
              your content or your misuse of Mementos leads to a claim against us, you agree to cover the reasonable
              costs of that claim. Nothing in these terms limits rights that the law doesn't allow us to limit.
            </Paragraph>
          </Section>

          <Section title="Changes to these terms">
            <Paragraph>
              We may update these terms. We will change the date at the top of this page, and tell you by email or
              in the app before a significant change takes effect. If you keep using Mementos after that, you accept
              the new terms.
            </Paragraph>
          </Section>

          <PartHeading id="privacy">Privacy Policy</PartHeading>

          <Section title="What we collect">
            <Bullets>
              <li><strong>Account details:</strong> your name, email address and password. Passwords are stored only as a bcrypt hash, so we can't read them.</li>
              <li><strong>Profile:</strong> your bio, if you write one.</li>
              <li><strong>Notes:</strong> the subject, text, tags and importance of each note, when it was written and edited, and when it is next due to come back to you.</li>
              <li><strong>Activity:</strong> who you follow, who follows you, the notes you like, the notes recently shown to you, and scores for the tags and authors you like, which we use to rank your feed.</li>
              <li><strong>Email settings:</strong> your weekly digest settings, when your last digest was sent, and whether your address is verified.</li>
              <li><strong>Emailed codes:</strong> a hash of each verification or password reset code, which expires after 30 minutes, and counters that limit how many are sent and tried.</li>
              <li><strong>Technical data:</strong> your IP address, which we use briefly to limit repeated requests. Our hosting provider may also keep standard server logs.</li>
              <li><strong>Analytics data:</strong> described under Google Analytics below.</li>
            </Bullets>
            <Paragraph>We don't collect payment details.</Paragraph>
          </Section>

          <Section title="How we use it">
            <Bullets>
              <li>to run Mementos: your account, your notes, following and likes</li>
              <li>to choose which notes to show you and when, which is done automatically</li>
              <li>to send account emails and the weekly digest</li>
              <li>to keep Mementos secure and enforce these terms</li>
              <li>to understand how people use Mementos and improve it</li>
            </Bullets>
            <Paragraph>We don't sell your personal data, and Mementos has no ads.</Paragraph>
            <Paragraph>
              If you are in the EEA or the UK, our legal bases are performing our contract with you, to run your
              account and its features, and our legitimate interests, to keep Mementos secure and understand how it
              is used. You can object to the second by emailing us.
            </Paragraph>
          </Section>

          <Section title="What other users can see">
            <Paragraph>
              Anyone signed in to Mementos can see your name, bio, join date and notes, the people you follow, the
              people who follow you, and how many likes each of your notes has. They can find you by searching for
              your name or bio. Your notes can also appear in other users' feeds and weekly digest emails.
            </Paragraph>
            <Paragraph>
              Other users can't see your email address, your password, your settings or which notes you have liked.
              People without an account can't see notes or profiles.
            </Paragraph>
          </Section>

          <Section title="Who we share data with">
            <Paragraph>We use these providers to run Mementos, and they handle data on our behalf:</Paragraph>
            <Bullets>
              <li><strong>Microsoft Azure</strong> hosts the app.</li>
              <li><strong>A managed MongoDB database service</strong> stores your data.</li>
              <li><strong>Resend</strong> delivers our emails, so it receives your name, your email address and the contents of each email, including the note snippets in the weekly digest.</li>
              <li><strong>Google</strong> provides analytics, described below.</li>
            </Bullets>
            <Paragraph>
              We may also share data if the law requires it, to protect people's rights or safety, or if Mementos
              moves to a new owner, in which case we will tell you. These providers may process data in the United
              States and other countries.
            </Paragraph>
          </Section>

          <Section title="Google Analytics">
            <Paragraph>
              We use Google Tag Manager and Google Analytics on every page to understand how Mementos is used. They
              send Google the pages you visit, the site that referred you, your browser, device, language and screen
              size, your approximate location based on your IP address, and actions such as scrolling, starting a
              form, downloading a file or following a link out of Mementos.
            </Paragraph>
            <Bullets>
              <li>Email addresses in page addresses are removed before they are sent to Google.</li>
              <li>Google Analytics records which form you start, not what you type into it.</li>
              <li>When you click a link in a note that leads out of Mementos, the full address of that link is recorded.</li>
              <li>Google's tag can also detect an email address, phone number or postal address on a page and send Google a hashed copy.</li>
            </Bullets>
            <Paragraph>
              Google Analytics keeps user-level data for up to 14 months. You can read{' '}
              <ExternalLink href="https://policies.google.com/technologies/partner-sites">how Google uses this data</ExternalLink>,
              and opt out with{' '}
              <ExternalLink href="https://tools.google.com/dlpage/gaoptout">Google's browser add-on</ExternalLink> or a
              content blocker.
            </Paragraph>
          </Section>

          <Section title="Cookies and browser storage">
            <Paragraph>
              Mementos itself doesn't set cookies. Google Analytics sets the _ga and _ga_* cookies to tell visitors
              and visits apart, and they last up to two years.
            </Paragraph>
            <Paragraph>
              We keep your session in your browser's local storage so you stay signed in: your sign-in token, user
              ID, name, email address and account role, until you sign out. We also keep a timestamp in session
              storage, which stops the app reloading in a loop after an update.
            </Paragraph>
            <Paragraph>
              A note can include an image hosted on another website. Your browser loads it from that website, which
              can then see your IP address.
            </Paragraph>
          </Section>

          <Section title="How long we keep data">
            <Paragraph>
              We keep your account and notes until you delete them or ask us to delete your account. A note you
              delete is removed from our database straight away. When we delete an account, we remove its profile,
              notes and activity within 30 days, though copies may remain in backups for a limited time.
            </Paragraph>
          </Section>

          <Section title="Your choices and rights">
            <Paragraph>
              In Settings you can change your name, bio, password and weekly digest. You can edit or delete your
              notes, unfollow people and remove your likes at any time.
            </Paragraph>
            <Paragraph>
              There is no delete button for accounts yet. To delete your account, change your email address or get a
              copy of your data, email <ContactLink /> from the address on your account, and we will respond within
              30 days.
            </Paragraph>
            <Paragraph>
              Depending on where you live, including the EEA, the UK and California, you may also have the right to
              access, correct, delete or move your data, to object to or restrict how we use it, and to complain to
              your data protection authority.
            </Paragraph>
          </Section>

          <Section title="Security">
            <Paragraph>
              Passwords and emailed codes are stored only as hashes. Notes are not end-to-end encrypted, so we can
              access them when we need to run or fix the service. No service is completely secure.
            </Paragraph>
          </Section>

          <Section title="Children">
            <Paragraph>
              Mementos is not meant for children under 13. If you believe a child under 13 has an account, email{' '}
              <ContactLink /> and we will delete it.
            </Paragraph>
          </Section>

          <Section title="Changes to this policy">
            <Paragraph>
              If we change this policy, we will update the date at the top of this page and tell you by email or in
              the app before a significant change takes effect.
            </Paragraph>
          </Section>

          <Section title="Contact us">
            <Paragraph>
              For questions or requests about these terms or your privacy, email <ContactLink />.
            </Paragraph>
          </Section>
        </Container>
      </Box>
    </CustomPage>
  );
};

export default TermsOfService;
