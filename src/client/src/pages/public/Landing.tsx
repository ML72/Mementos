import React from 'react';
import { Button, Container, Typography, Box, Grid, Stack, Paper, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import CustomPage from '../../components/layout/CustomPage';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PeopleIcon from '@mui/icons-material/People';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import ShieldIcon from '@mui/icons-material/Shield';

const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <CustomPage useBindingContainer={false} showNavigation={true}>
      <Box sx={{ backgroundColor: '#ffffff', minHeight: '100vh', pb: 10 }}>
        {/* Hero Section */}
        <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 16 }, pb: { xs: 8, md: 12 } }}>
          <Grid container spacing={6} alignItems="center">
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h1" sx={{
                fontSize: { xs: '3rem', md: '4.5rem' },
                fontWeight: 700,
                color: '#111827',
                lineHeight: 1.1,
                letterSpacing: '-1.5px',
                mb: 3
              }}>
                Your personal <br />
                <Box component="span" sx={{ color: '#0A66C2' }}>replay buffer.</Box>
              </Typography>
              <Typography variant="h5" sx={{
                color: '#4B5563',
                mb: 5,
                fontWeight: 400,
                lineHeight: 1.5,
                fontSize: '1.25rem',
                maxWidth: '90%'
              }}>
                Mementos helps you capture your daily learnings and delivers beautifully curated weekly digests to ensure you never forget what matters. Read, retain, and share with a network of lifelong learners.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => navigate('/login?tab=signup')}
                  endIcon={<ArrowForwardIcon />}
                  sx={{
                    px: 4, py: 1.5,
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    borderRadius: '8px',
                    textTransform: 'none',
                    boxShadow: 'none',
                    '&:hover': { backgroundColor: '#333333', boxShadow: 'none' }
                  }}
                >
                  Get Mementos Free
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  sx={{
                    px: 4, py: 1.5,
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    borderColor: '#E5E7EB',
                    color: '#111827',
                    borderRadius: '8px',
                    textTransform: 'none',
                    '&:hover': { backgroundColor: '#F9FAFB', borderColor: '#D1D5DB' }
                  }}
                >
                  Explore Features
                </Button>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
              <Box sx={{
                width: '100%',
                height: '400px',
                position: 'relative',
                borderRadius: '24px',
                backgroundColor: '#f9f9f9',
                border: '1px solid #eaeaea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}>
                <Box sx={{
                  position: 'absolute',
                  width: '300px',
                  height: '300px',
                  background: 'linear-gradient(45deg, rgba(10, 102, 194, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
                  borderRadius: '50%',
                  filter: 'blur(50px)',
                  top: '10%',
                  left: '20%'
                }} />
                <Box sx={{
                  position: 'absolute',
                  width: '200px',
                  height: '200px',
                  background: 'linear-gradient(45deg, rgba(16, 185, 129, 0.1) 0%, rgba(52, 211, 153, 0.1) 100%)',
                  borderRadius: '50%',
                  filter: 'blur(40px)',
                  bottom: '10%',
                  right: '10%'
                }} />
                <Box sx={{
                  backgroundColor: '#fff',
                  p: 4,
                  borderRadius: '16px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  border: '1px solid #f0f0f0',
                  width: '75%',
                  zIndex: 1
                }}>
                  <Typography variant="overline" sx={{ color: '#0A66C2', fontWeight: 800, letterSpacing: '1px' }}>Weekly Digest • Vol. 42</Typography>
                  <Typography variant="h6" sx={{ mt: 1, fontWeight: 700, color: '#111827' }}>Understanding Context Windows</Typography>
                  <Typography variant="body2" sx={{ mt: 1, color: '#4B5563', mb: 3, lineHeight: 1.6 }}>You noted that larger context windows allow models to process more tokens but dilute attention across middle components. Review this to keep it sharp.</Typography>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#E5E7EB', mr: 2, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Typography variant="subtitle2" sx={{ color: '#6B7280' }}>J</Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#111827' }}>From Jane's Notes</Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280' }}>Followed Topic: Machine Learning</Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Container>

        {/* Value Prop Section */}
        <Box sx={{ backgroundColor: '#F9FAFB', py: { xs: 8, md: 12 }, borderTop: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB' }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 8 }}>
              <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, fontWeight: 700, color: '#111827', mb: 2 }}>
                Built for continuous growth
              </Typography>
              <Typography variant="h6" sx={{ color: '#4B5563', fontWeight: 400, maxWidth: '700px', mx: 'auto' }}>
                Supercharge your memory with tools inspired by machine learning, perfectly adapted for human cognition.
              </Typography>
            </Box>

            <Grid container spacing={4}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper elevation={0} sx={{ p: 4, height: '100%', backgroundColor: 'transparent' }}>
                  <NotificationsActiveIcon sx={{ fontSize: 36, color: '#000', mb: 3 }} />
                  <Typography variant="h5" sx={{ fontWeight: 600, color: '#111827', mb: 2, fontSize: '1.25rem' }}>Spaced Repetition Emails</Typography>
                  <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                    We automatically surface your old notes in concise, beautifully formatted weekly emails. Reinforce your knowledge exactly when your brain begins to forget.
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper elevation={0} sx={{ p: 4, height: '100%', backgroundColor: 'transparent' }}>
                  <MenuBookIcon sx={{ fontSize: 36, color: '#000', mb: 3 }} />
                  <Typography variant="h5" sx={{ fontWeight: 600, color: '#111827', mb: 2, fontSize: '1.25rem' }}>Frictionless Journaling</Typography>
                  <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                    Capture concepts quickly with our minimalist editor. Organize by topics or just write free-form. Everything is meticulously indexed and ready for your future self.
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper elevation={0} sx={{ p: 4, height: '100%', backgroundColor: 'transparent' }}>
                  <PeopleIcon sx={{ fontSize: 36, color: '#000', mb: 3 }} />
                  <Typography variant="h5" sx={{ fontWeight: 600, color: '#111827', mb: 2, fontSize: '1.25rem' }}>Social Knowledge Graph</Typography>
                  <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                    Follow mentors and peers. Their best public notes integrate directly into your digest, creating a shared replay buffer for accelerated learning and discovery.
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Deep Dive Section */}
        <Container maxWidth="lg" sx={{ py: { xs: 8, md: 16 } }}>
          <Grid container spacing={8} alignItems="center">
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{
                width: '100%',
                height: '420px',
                backgroundColor: '#0d1117',
                borderRadius: '16px',
                p: 4,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #30363d'
              }}>
                <Box sx={{ display: 'flex', gap: 1.5, mb: 4 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff5f56' }} />
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#27c93f' }} />
                </Box>
                <Stack spacing={2} sx={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace', fontSize: '0.9rem' }}>
                  <Typography sx={{ color: '#7ee787' }}>$ mementos-core trigger --digest</Typography>
                  <Typography sx={{ color: '#8b949e' }}>[info] Accessing episodic memory vault...</Typography>
                  <Typography sx={{ color: '#8b949e' }}>[info] Evaluating decay curves for 1,420 notes...</Typography>
                  <Typography sx={{ color: '#8b949e' }}>[info] Merging high-value insights from followed network...</Typography>
                  <Typography sx={{ color: '#79c0ff' }}>[success] Digest compiled. Dispatching to user payload.</Typography>
                </Stack>
                <Box sx={{ mt: 'auto', p: 2, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: '3px solid #79c0ff' }}>
                  <Typography sx={{ color: '#c9d1d9', fontSize: '0.875rem', fontStyle: 'italic' }}>
                    "The defining characteristic of an intelligent system is its ability to learn from past experiences without catastrophic forgetting."
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#111827', mb: 3, fontSize: { xs: '2rem', md: '2.5rem' }, letterSpacing: '-0.5px' }}>
                Train your brain like a smarter model.
              </Typography>
              <Typography sx={{ color: '#4B5563', fontSize: '1.125rem', lineHeight: 1.7, mb: 5 }}>
                In foundational machine learning, experience replay buffers store past events so agents can train on them consistently. Human memory works exactly the same way. By resurfacing your previous notes at precise intervals, Mementos ensures the concepts you spent time learning remain ingrained in your long-term memory.
              </Typography>
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                  <Box sx={{ mt: 0.5, p: 1, backgroundColor: '#f3f4f6', borderRadius: '8px', mr: 2 }}>
                    <AutoAwesomeIcon sx={{ color: '#111827', fontSize: 20 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ color: '#111827', fontWeight: 600, mb: 0.5 }}>Adaptive Selection Algorithms</Typography>
                    <Typography sx={{ color: '#6B7280', fontSize: '0.9rem' }}>Notes are selected precisely as you are about to forget them.</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                  <Box sx={{ mt: 0.5, p: 1, backgroundColor: '#f3f4f6', borderRadius: '8px', mr: 2 }}>
                    <AllInclusiveIcon sx={{ color: '#111827', fontSize: 20 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ color: '#111827', fontWeight: 600, mb: 0.5 }}>Continuous Knowledge Circulation</Typography>
                    <Typography sx={{ color: '#6B7280', fontSize: '0.9rem' }}>Keep your foundational knowledge active without the friction of reviewing.</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                  <Box sx={{ mt: 0.5, p: 1, backgroundColor: '#f3f4f6', borderRadius: '8px', mr: 2 }}>
                    <ShieldIcon sx={{ color: '#111827', fontSize: 20 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ color: '#111827', fontWeight: 600, mb: 0.5 }}>Private by Default, Public by Choice</Typography>
                    <Typography sx={{ color: '#6B7280', fontSize: '0.9rem' }}>Keep your roughest thoughts private, and publish the polished ones.</Typography>
                  </Box>
                </Box>
              </Stack>
            </Grid>
          </Grid>
        </Container>

        {/* CTA Section */}
        <Container maxWidth="lg" sx={{ mb: 4 }}>
          <Box sx={{
            backgroundColor: '#111827',
            borderRadius: '24px',
            py: 10,
            px: 4,
            textAlign: 'center',
            color: '#ffffff',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <Typography variant="h3" sx={{ fontWeight: 700, mb: 3, letterSpacing: '-1px' }}>
              Ready to build your memory buffer?
            </Typography>
            <Typography sx={{ color: '#9CA3AF', mb: 5, fontSize: '1.125rem', maxWidth: '600px', mx: 'auto', lineHeight: 1.6 }}>
              Join thoughtful professionals, engineers, and creatives who are already retaining more of what they learn, directly from their inbox.
            </Typography>
            <Button
              variant="contained"
              size="large"
              onClick={() => navigate('/login?tab=signup')}
              sx={{
                px: 6, py: 2,
                fontSize: '1.05rem',
                fontWeight: 600,
                backgroundColor: '#ffffff',
                color: '#000000',
                borderRadius: '12px',
                textTransform: 'none',
                '&:hover': { backgroundColor: '#F3F4F6' }
              }}
            >
              Create Your Account
            </Button>
          </Box>
        </Container>
      </Box>
    </CustomPage>
  );
};

export default Landing;
