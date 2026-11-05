import React from 'react';
import { Box, Button, Chip, Container, Grid, Link, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import CustomPage from '../../components/layout/CustomPage';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import ForwardToInboxRoundedIcon from '@mui/icons-material/ForwardToInboxRounded';
import StyleRoundedIcon from '@mui/icons-material/StyleRounded';
import FunctionsRoundedIcon from '@mui/icons-material/FunctionsRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import GitHubIcon from '@mui/icons-material/GitHub';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';

const INK = '#111827';
const BODY = '#4B5563';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
// The logo's violet-to-coral gradient, deepened so text drawn with it stays readable on white.
const BRAND_GRADIENT = 'linear-gradient(90deg, #7C3AED 0%, #DB2777 55%, #EA580C 100%)';
const GITHUB_URL = 'https://github.com/ML72/Mementos';
const SIGN_UP = '/login?tab=signup';
const HOW_IT_WORKS = 'how-it-works';

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
`;

/** Entrance animation for the hero, left out for anyone who prefers reduced motion. */
const entrance = (delayMs: number) => ({
  '@media (prefers-reduced-motion: no-preference)': {
    animation: `${fadeUp} 600ms cubic-bezier(0.2, 0.7, 0.2, 1) ${delayMs}ms both`
  }
});

const gradientText = {
  backgroundImage: BRAND_GRADIENT,
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent'
};

const card = {
  backgroundColor: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: '16px',
  boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 12px 32px -12px rgba(16, 24, 40, 0.12)'
};

const tagChip = { borderRadius: '6px', backgroundColor: '#F3F4F6', color: BODY, fontWeight: 500 };

const primaryButton = {
  px: 3.5,
  py: 1.5,
  fontSize: '1.05rem',
  fontWeight: 600,
  // Full width and free to wrap on phones; one line from there up, the row wrapping instead.
  whiteSpace: { sm: 'nowrap' },
  borderRadius: '10px',
  backgroundColor: '#000',
  color: '#fff',
  boxShadow: 'none',
  '&:hover': { backgroundColor: '#333', boxShadow: 'none' }
};

/**
 * Joins the last three words with no-break spaces, so however wide a card gets, its text never
 * ends on a line of just one or two words.
 */
const keepLastWordsTogether = (text: string) => text.replace(/ (\S+) (\S+)$/, '\u00A0$1\u00A0$2');

const scrollToSection = (id: string) => (event: React.MouseEvent) => {
  event.preventDefault();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
};

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      px: 1.5,
      py: 0.5,
      mb: 2.5,
      borderRadius: '999px',
      backgroundColor: '#F5F3FF',
      border: '1px solid #EDE9FE',
      color: '#6D28D9',
      fontSize: '0.8125rem',
      fontWeight: 600
    }}
  >
    {children}
  </Box>
);

const SectionHeading: React.FC<{ eyebrow?: string; title: string; subtitle?: string }> = ({ eyebrow, title, subtitle }) => (
  <Box sx={{ textAlign: 'center', maxWidth: 680, mx: 'auto', mb: { xs: 5, md: 7 } }}>
    {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
    <Typography component="h2" sx={{ fontSize: { xs: '1.875rem', md: '2.5rem' }, fontWeight: 800, color: INK, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
      {title}
    </Typography>
    {subtitle && (
      <Typography sx={{ mt: 2, color: BODY, fontSize: { xs: '1rem', md: '1.125rem' }, lineHeight: 1.6 }}>
        {subtitle}
      </Typography>
    )}
  </Box>
);

/* ------------------------------------------------------------------------------------------------
 * The memory curve: an illustration of spaced repetition, not data. Without review, recall falls
 * away; with Mementos each review brings it back, and it fades more slowly every time.
 * --------------------------------------------------------------------------------------------- */

// Geometry in SVG units; the viewBox scales it to whatever width it gets.
const CURVE = { left: 12, right: 348, top: 14, bottom: 128 };
// Where reviews happen: each gap is longer than the last (about 1, 2, 4, then 8 days at the
// default importance), and each review makes the next decline gentler.
const REVIEW_XS = [12, 60, 122, 206, 320];
const STABILITY = [60, 110, 240, 520, 800];
const GAP_LABELS = ['1 day', '2 days', '4 days', '8 days'];
const RECALL_FLOOR = 0.1;

const recallAt = (elapsed: number, stability: number) => RECALL_FLOOR + (1 - RECALL_FLOOR) * Math.exp(-elapsed / stability);
const yOf = (recall: number) => CURVE.top + (1 - recall) * (CURVE.bottom - CURVE.top);

/** Path commands for recall decaying from full, between two x positions. */
const decay = (from: number, to: number, stability: number): string => {
  const steps = 24;
  const commands: string[] = [];
  for (let i = 1; i <= steps; i++) {
    const x = from + ((to - from) * i) / steps;
    commands.push(`L${x.toFixed(1)} ${yOf(recallAt(x - from, stability)).toFixed(1)}`);
  }
  return commands.join(' ');
};

const WITH_REVIEWS = REVIEW_XS.reduce((path, start, i) => {
  const end = REVIEW_XS[i + 1] ?? CURVE.right;
  // A review brings recall straight back to full.
  return `${path}${i > 0 ? ` L${start} ${yOf(1)}` : ''} ${decay(start, end, STABILITY[i])}`;
}, `M${CURVE.left} ${yOf(1)}`);
const WITHOUT_REVIEWS = `M${CURVE.left} ${yOf(1)} ${decay(CURVE.left, CURVE.right, STABILITY[0])}`;

const MemoryCurve: React.FC = () => (
  <svg
    viewBox="0 0 360 156"
    role="img"
    aria-label="Without review, how much you remember drops off within days. With Mementos, each review brings it back, and it fades more slowly every time."
    style={{ display: 'block', width: '100%', height: 'auto' }}
  >
    <defs>
      <linearGradient id="landing-recall-stroke" gradientUnits="userSpaceOnUse" x1={CURVE.left} y1="0" x2={CURVE.right} y2="0">
        <stop offset="0" stopColor="#7C3AED" />
        <stop offset="0.55" stopColor="#DB2777" />
        <stop offset="1" stopColor="#EA580C" />
      </linearGradient>
      <linearGradient id="landing-recall-fill" gradientUnits="userSpaceOnUse" x1="0" y1={CURVE.top} x2="0" y2={CURVE.bottom}>
        <stop offset="0" stopColor="#DB2777" stopOpacity="0.14" />
        <stop offset="1" stopColor="#DB2777" stopOpacity="0" />
      </linearGradient>
    </defs>

    {REVIEW_XS.slice(1).map((x) => (
      <line key={x} x1={x} y1={yOf(1)} x2={x} y2={CURVE.bottom} stroke={BORDER} strokeDasharray="2 4" />
    ))}
    <line x1={CURVE.left} y1={CURVE.bottom} x2={CURVE.right} y2={CURVE.bottom} stroke={BORDER} />

    <path d={`${WITH_REVIEWS} L${CURVE.right} ${CURVE.bottom} L${CURVE.left} ${CURVE.bottom} Z`} fill="url(#landing-recall-fill)" />
    <path d={WITHOUT_REVIEWS} fill="none" stroke="#868E9C" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" />
    <path d={WITH_REVIEWS} fill="none" stroke="url(#landing-recall-stroke)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

    <circle cx={CURVE.left} cy={yOf(1)} r="4.5" fill={INK} />
    {REVIEW_XS.slice(1).map((x) => (
      <circle key={x} cx={x} cy={yOf(1)} r="4.5" fill="#fff" stroke="url(#landing-recall-stroke)" strokeWidth="2.5" />
    ))}

    {GAP_LABELS.map((label, i) => (
      <text
        key={label}
        x={(REVIEW_XS[i] + REVIEW_XS[i + 1]) / 2}
        y={CURVE.bottom + 20}
        textAnchor="middle"
        fontSize="13"
        fill={MUTED}
        fontFamily="inherit"
      >
        {label}
      </text>
    ))}
  </svg>
);

const LegendItem: React.FC<{ swatch: React.ReactNode; label: string }> = ({ swatch, label }) => (
  <Stack direction="row" alignItems="center" spacing={0.75}>
    {swatch}
    <Typography component="span" sx={{ fontSize: '0.75rem', color: MUTED, whiteSpace: 'nowrap' }}>{label}</Typography>
  </Stack>
);

/** The hero's picture of the product: a note coming back, why it comes back, and the weekly email. */
const HeroPreview: React.FC = () => (
  <Box sx={{ maxWidth: 500, mx: 'auto', width: '100%' }}>
    <Box sx={{ ...card, position: 'relative', zIndex: 2, p: { xs: 2.5, sm: 3 }, width: { xs: '100%', sm: '88%' }, ...entrance(150) }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{ px: 1, py: 0.25, borderRadius: '999px', backgroundColor: '#F5F3FF', color: '#6D28D9', fontSize: '0.75rem', fontWeight: 600 }}
        >
          <ReplayRoundedIcon sx={{ fontSize: 15 }} />
          <span>Back for review</span>
        </Stack>
        <Typography component="span" sx={{ fontSize: '0.75rem', color: MUTED }}>Written 7 days ago</Typography>
      </Stack>
      <Typography sx={{ fontWeight: 700, color: INK, fontSize: '1.05rem', mb: 0.75 }}>The spacing effect</Typography>
      <Typography sx={{ color: BODY, fontSize: '0.925rem', lineHeight: 1.6 }}>
        {keepLastWordsTogether("We remember more when reviews are spread out over days than when they're crammed into one sitting, as Ebbinghaus found in 1885.")}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        {['learning', 'memory'].map((tag) => <Chip key={tag} label={tag} size="small" sx={tagChip} />)}
      </Stack>
    </Box>

    <Box sx={{ ...card, mt: -3, ml: 'auto', width: { xs: '100%', sm: '92%' }, pt: 5.5, px: { xs: 2, sm: 3 }, pb: 4.5, ...entrance(300) }}>
      <Stack direction="row" flexWrap="wrap" useFlexGap alignItems="center" justifyContent="space-between" rowGap={1} columnGap={2} sx={{ mb: 1.5 }}>
        <Typography sx={{ fontWeight: 700, color: INK, fontSize: '0.9rem' }}>How much you remember</Typography>
        <Stack direction="row" spacing={1.5}>
          <LegendItem swatch={<Box sx={{ width: 18, height: 3, borderRadius: 2, backgroundImage: BRAND_GRADIENT }} />} label="With Mementos" />
          <LegendItem swatch={<Box sx={{ width: 18, borderTop: '2px dashed #868E9C' }} />} label="Without review" />
        </Stack>
      </Stack>
      <MemoryCurve />
    </Box>

    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ ...card, borderRadius: '14px', position: 'relative', zIndex: 2, mt: -2.5, ml: 'auto', mr: { xs: 1.5, sm: -1 }, width: 'fit-content', maxWidth: 'calc(100% - 12px)', py: 1.25, px: 1.75, ...entrance(450) }}
    >
      <Box sx={{ flexShrink: 0, width: 34, height: 34, borderRadius: '10px', backgroundImage: BRAND_GRADIENT, color: '#fff', display: 'grid', placeItems: 'center' }}>
        <MailOutlineRoundedIcon sx={{ fontSize: 19 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: INK, lineHeight: 1.3 }}>Your weekly Mementos digest</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: MUTED }}>Your top notes, every Sunday</Typography>
      </Box>
    </Stack>
  </Box>
);

/* ------------------------------------------------------------------------------------------------
 * Page content
 * --------------------------------------------------------------------------------------------- */

const STEPS = [
  {
    icon: <EditNoteRoundedIcon />,
    title: 'Write it down',
    text: 'Capture what you learned in a few lines. Markdown, LaTeX math, code blocks and tags are all built in.'
  },
  {
    icon: <ReplayRoundedIcon />,
    title: 'It comes back',
    text: 'Each note returns on a spaced repetition schedule: after about a day, then two, then four, the gap doubling with each review. Due notes wait in your feed.'
  },
  {
    icon: <ForwardToInboxRoundedIcon />,
    title: 'It finds you',
    text: 'Once a week, a digest email brings your top notes to you, on the day you pick.'
  }
];

const FEED_PREVIEW = [
  {
    name: 'Priya N.',
    when: '2 days ago',
    subject: 'The rule of 72',
    text: 'Divide 72 by the yearly interest rate to estimate how many years money takes to double.',
    tags: ['finance'],
    likes: 14
  },
  {
    name: 'Marcus L.',
    when: '5 days ago',
    subject: 'Hash map lookups',
    text: 'O(1) on average, but O(n) in the worst case, when every key lands in the same bucket.',
    tags: ['cs', 'interviews'],
    likes: 9
  }
];

const FEATURES = [
  {
    icon: <StyleRoundedIcon />,
    title: 'No flashcards to make',
    text: 'Spaced repetition usually means building decks. Mementos schedules the notes you already write.'
  },
  {
    icon: <FunctionsRoundedIcon />,
    title: 'Markdown and math',
    text: "Headings, lists, code and LaTeX equations, rendered the way you'd expect."
  },
  {
    icon: <MailOutlineRoundedIcon />,
    title: 'A digest on your terms',
    text: 'Choose the day it arrives, or switch it off whenever you like.'
  },
  {
    icon: <GitHubIcon />,
    title: 'Open source',
    text: 'Every line of code is public, scheduling algorithm included, so you can see how it works.',
    link: { href: GITHUB_URL, label: 'View on GitHub' }
  }
];

const Landing: React.FC = () => {
  return (
    <CustomPage title="Notes that come back to you" useBindingContainer={false} showNavigation={true}>
      {/* Hero */}
      <Box
        component="section"
        sx={{
          overflow: 'hidden',
          background:
            'radial-gradient(640px circle at 88% 8%, rgba(124, 58, 237, 0.10), transparent 62%),' +
            'radial-gradient(520px circle at 70% 96%, rgba(234, 88, 12, 0.07), transparent 60%)'
        }}
      >
        <Container maxWidth="lg" sx={{ pt: { xs: 6, md: 12 }, pb: { xs: 9, md: 13 } }}>
          <Grid container spacing={{ xs: 7, md: 8 }} alignItems="center">
            <Grid size={{ xs: 12, md: 6, lg: 7 }} sx={entrance(0)}>
              <Eyebrow>Spaced repetition for your notes</Eyebrow>
              <Typography
                component="h1"
                sx={{
                  fontSize: { xs: '2.5rem', sm: '3.25rem', md: '3rem', lg: '3.5rem' },
                  fontWeight: 800,
                  color: INK,
                  lineHeight: 1.06,
                  letterSpacing: '-0.035em',
                  // Where a line has to wrap, keep the lines even rather than leaving one word alone.
                  textWrap: 'balance'
                }}
              >
                Write it once.
                <Box component="span" sx={{ display: 'block' }}>
                  <Box component="span" sx={gradientText}>Remember it for good.</Box>
                </Box>
              </Typography>
              <Typography sx={{ mt: 3, color: BODY, fontSize: { xs: '1.0625rem', md: '1.1875rem' }, lineHeight: 1.6, maxWidth: '34rem' }}>
                Mementos brings each note back just as it starts to fade, in your feed and in a weekly email,
                so the things you learn actually stick. No flashcards to make.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap flexWrap="wrap" spacing={1.5} sx={{ mt: 4 }}>
                <Button
                  component={RouterLink}
                  to={SIGN_UP}
                  variant="contained"
                  size="large"
                  endIcon={<ArrowForwardRoundedIcon />}
                  sx={primaryButton}
                >
                  Start remembering for free
                </Button>
                <Button
                  href={`#${HOW_IT_WORKS}`}
                  onClick={scrollToSection(HOW_IT_WORKS)}
                  variant="outlined"
                  size="large"
                  sx={{
                    px: 3.5,
                    py: 1.5,
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    whiteSpace: { sm: 'nowrap' },
                    borderRadius: '10px',
                    borderColor: '#D1D5DB',
                    color: INK,
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    '&:hover': { backgroundColor: '#F9FAFB', borderColor: '#9CA3AF' }
                  }}
                >
                  See how it works
                </Button>
              </Stack>

              <Stack component="ul" direction="row" flexWrap="wrap" useFlexGap columnGap={2.5} rowGap={1} sx={{ mt: 3, listStyle: 'none' }}>
                {['Free and open source', 'No credit card', 'Unsubscribe anytime'].map((item) => (
                  <Stack component="li" key={item} direction="row" alignItems="center" spacing={0.75} sx={{ color: MUTED, fontSize: '0.9rem' }}>
                    <CheckRoundedIcon sx={{ fontSize: 18, color: '#16A34A' }} />
                    <span>{item}</span>
                  </Stack>
                ))}
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 5 }}>
              <HeroPreview />
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* How it works */}
      <Box
        component="section"
        id={HOW_IT_WORKS}
        sx={{ scrollMarginTop: '72px', backgroundColor: '#F9FAFB', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, py: { xs: 9, md: 12 } }}
      >
        <Container maxWidth="lg">
          <SectionHeading
            eyebrow="How it works"
            title="You write it down. Mementos brings it back."
            subtitle="AI models hold on to old skills by replaying past examples as they learn new ones. Mementos is a replay buffer for human memory, with no flashcard decks to build and no streaks to keep."
          />
          <Grid container spacing={3}>
            {STEPS.map((step, i) => (
              <Grid key={step.title} size={{ xs: 12, md: 4 }}>
                <Box sx={{ ...card, boxShadow: 'none', height: '100%', p: { xs: 3, md: 3.5 } }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
                    <Box sx={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: INK, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                      {i + 1}
                    </Box>
                    <Box sx={{ color: '#9CA3AF', display: 'flex' }}>{step.icon}</Box>
                  </Stack>
                  <Typography component="h3" sx={{ fontSize: '1.2rem', fontWeight: 700, color: INK, mb: 1 }}>{step.title}</Typography>
                  <Typography sx={{ color: BODY, lineHeight: 1.65 }}>{keepLastWordsTogether(step.text)}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Learn together */}
      <Box component="section" sx={{ py: { xs: 9, md: 12 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 6, md: 10 }} alignItems="center">
            <Grid size={{ xs: 12, md: 6 }} sx={{ order: { xs: 2, md: 1 } }}>
              <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto' }}>
                {FEED_PREVIEW.map((note, i) => (
                  <Box key={note.subject} sx={{ ...card, p: 2.5, ml: { sm: i === 1 ? 5 : 0 }, mr: { sm: i === 0 ? 5 : 0 } }}>
                    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.5 }}>
                      <Box sx={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#F3F4F6', color: BODY, display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: '0.85rem' }}>
                        {note.name.charAt(0)}
                      </Box>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', color: INK }}>{note.name}</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: MUTED }}>· {note.when}</Typography>
                    </Stack>
                    <Typography sx={{ fontWeight: 700, color: INK, mb: 0.5 }}>{note.subject}</Typography>
                    <Typography sx={{ color: BODY, fontSize: '0.9rem', lineHeight: 1.6 }}>{keepLastWordsTogether(note.text)}</Typography>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.75 }}>
                      <Stack direction="row" spacing={1}>
                        {note.tags.map((tag) => <Chip key={tag} label={tag} size="small" sx={tagChip} />)}
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: '#DB2777' }}>
                        <FavoriteRoundedIcon sx={{ fontSize: 18 }} />
                        <Typography component="span" sx={{ fontSize: '0.85rem', fontWeight: 600, color: BODY }}>{note.likes}</Typography>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ order: { xs: 1, md: 2 } }}>
              <Eyebrow>Learn together</Eyebrow>
              <Typography component="h2" sx={{ fontSize: { xs: '1.875rem', md: '2.5rem' }, fontWeight: 800, color: INK, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
                Follow people worth learning from.
              </Typography>
              <Typography sx={{ mt: 2.5, color: BODY, fontSize: { xs: '1rem', md: '1.125rem' }, lineHeight: 1.65 }}>
                Follow friends, classmates or experts, and their notes join your feed alongside your own reviews.
                Like the ones that help, and your feed learns which topics and people matter to you.
              </Typography>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* What makes it different */}
      <Box component="section" sx={{ pb: { xs: 9, md: 12 } }}>
        <Container maxWidth="lg">
          <SectionHeading title="Built to make it stick" />
          <Grid container spacing={3}>
            {FEATURES.map((feature) => (
              <Grid key={feature.title} size={{ xs: 12, sm: 6, md: 3 }}>
                <Box sx={{ height: '100%', p: 3, borderRadius: '16px', border: `1px solid ${BORDER}` }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: '12px', backgroundColor: '#F5F3FF', color: '#6D28D9', display: 'grid', placeItems: 'center', mb: 2 }}>
                    {feature.icon}
                  </Box>
                  <Typography component="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, color: INK, mb: 0.75 }}>{feature.title}</Typography>
                  <Typography sx={{ color: BODY, fontSize: '0.95rem', lineHeight: 1.6 }}>{keepLastWordsTogether(feature.text)}</Typography>
                  {feature.link && (
                    <Link
                      href={feature.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="hover"
                      sx={{ display: 'inline-block', mt: 1.5, fontSize: '0.95rem', fontWeight: 600, color: '#6D28D9' }}
                    >
                      {feature.link.label}
                    </Link>
                  )}
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Closing call to action */}
      <Container maxWidth="lg" sx={{ pb: { xs: 6, md: 8 } }}>
        <Box
          component="section"
          sx={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '24px',
            color: '#fff',
            textAlign: 'center',
            px: { xs: 3, md: 6 },
            py: { xs: 7, md: 10 },
            background:
              'radial-gradient(520px circle at 15% 0%, rgba(124, 58, 237, 0.35), transparent 60%),' +
              `radial-gradient(520px circle at 85% 100%, rgba(234, 88, 12, 0.25), transparent 60%), ${INK}`
          }}
        >
          <Typography component="h2" sx={{ fontSize: { xs: '1.875rem', md: '2.75rem' }, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.12 }}>
            Start remembering what you learn.
          </Typography>
          <Typography sx={{ mt: 2, mx: 'auto', maxWidth: 520, color: '#D1D5DB', fontSize: { xs: '1rem', md: '1.125rem' }, lineHeight: 1.6 }}>
            Your first note takes a minute. Mementos takes care of the rest.
          </Typography>
          <Button
            component={RouterLink}
            to={SIGN_UP}
            variant="contained"
            size="large"
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{
              mt: 4,
              px: 4,
              py: 1.5,
              fontSize: '1.05rem',
              fontWeight: 600,
              borderRadius: '10px',
              backgroundColor: '#fff',
              color: '#000',
              boxShadow: 'none',
              width: { xs: '100%', sm: 'auto' },
              '&:hover': { backgroundColor: '#F3F4F6', boxShadow: 'none' }
            }}
          >
            Create your free account
          </Button>
          <Typography sx={{ mt: 2, color: '#9CA3AF', fontSize: '0.875rem' }}>Free and open source. No credit card.</Typography>
        </Box>
      </Container>

      {/* Footer */}
      <Box component="footer" sx={{ borderTop: `1px solid ${BORDER}` }}>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2}>
            <Typography sx={{ color: MUTED, fontSize: '0.875rem' }}>
              <Box component="span" sx={{ fontWeight: 700, color: INK }}>Mementos</Box> · Notes that come back to you.
            </Typography>
            <Stack direction="row" spacing={3}>
              <Link component={RouterLink} to="/about" underline="hover" sx={{ color: MUTED, fontSize: '0.875rem' }}>About</Link>
              <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ color: MUTED, fontSize: '0.875rem' }}>GitHub</Link>
              <Link component={RouterLink} to="/login?tab=login" underline="hover" sx={{ color: MUTED, fontSize: '0.875rem' }}>Sign in</Link>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </CustomPage>
  );
};

export default Landing;
