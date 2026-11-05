import React from 'react';
import { Container, Typography, Box, Link, Paper } from '@mui/material';
import Grid2 from '@mui/material/Grid';
import CustomPage from '../../components/layout/CustomPage';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import GitHubIcon from '@mui/icons-material/GitHub';

const About: React.FC = () => {
  return (
    <CustomPage title="About" showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#ffffff', minHeight: '100vh', pb: 10 }}>
        {/* Header Section */}
        <Container maxWidth="md" sx={{ pt: { xs: 8, md: 12 }, pb: { xs: 6, md: 8 }, textAlign: 'center' }}>
          <Typography variant="h1" sx={{
            fontSize: { xs: '2.5rem', md: '3.5rem' },
            fontWeight: 800,
            color: '#111827',
            mb: 3,
            letterSpacing: '-1px'
          }}>
            About <Box component="span" sx={{ color: '#0A66C2' }}>Mementos</Box>
          </Typography>
          <Typography variant="h6" sx={{ color: '#4B5563', fontWeight: 400, lineHeight: 1.6, maxWidth: '800px', mx: 'auto', mb: 4 }}>
            Mementos serves as a regular memory jog, similar to a replay buffer in machine learning.
            It helps you better remember things you came across in the past.
          </Typography>
        </Container>

        {/* Features Section */}
        <Box sx={{ backgroundColor: '#F9FAFB', py: { xs: 8, md: 10 }, borderTop: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB' }}>
          <Container maxWidth="lg">
            <Grid2 container spacing={4}>
              {/* Feature 1 */}
              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <Paper elevation={0} sx={{ p: 4, height: '100%', borderRadius: '16px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', transition: 'box-shadow 0.3s', '&:hover': { boxShadow: '0 10px 30px rgba(0,0,0,0.05)' } }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: '12px', backgroundColor: '#EFF6FF', color: '#0A66C2', display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 3 }}>
                    <LightbulbOutlinedIcon />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827', mb: 2 }}>
                    Capture Insights
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4B5563', lineHeight: 1.6, mb: 0 }}>
                    A dedicated space to regularly write and store interesting notes you've learned about various subjects.
                  </Typography>
                </Paper>
              </Grid2>

              {/* Feature 2 */}
              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <Paper elevation={0} sx={{ p: 4, height: '100%', borderRadius: '16px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', transition: 'box-shadow 0.3s', '&:hover': { boxShadow: '0 10px 30px rgba(0,0,0,0.05)' } }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: '12px', backgroundColor: '#ECFDF5', color: '#10B981', display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 3 }}>
                    <EmailOutlinedIcon />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827', mb: 2 }}>
                    Weekly Digest
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4B5563', lineHeight: 1.6, mb: 0 }}>
                    Every week, receive an email containing a few randomly selected notes you wrote in the past to refresh your memory.
                  </Typography>
                </Paper>
              </Grid2>

              {/* Feature 3 */}
              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <Paper elevation={0} sx={{ p: 4, height: '100%', borderRadius: '16px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', transition: 'box-shadow 0.3s', '&:hover': { boxShadow: '0 10px 30px rgba(0,0,0,0.05)' } }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: '12px', backgroundColor: '#F3E8FF', color: '#8B5CF6', display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 3 }}>
                    <GroupOutlinedIcon />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827', mb: 2 }}>
                    Social Learning
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4B5563', lineHeight: 1.6, mb: 0 }}>
                    Follow other users to get some of their notes included in your weekly feed, expanding your knowledge network.
                  </Typography>
                </Paper>
              </Grid2>

              {/* Feature 4 */}
              <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                <Paper elevation={0} sx={{ p: 4, height: '100%', borderRadius: '16px', border: '1px solid #E5E7EB', backgroundColor: '#ffffff', transition: 'box-shadow 0.3s', '&:hover': { boxShadow: '0 10px 30px rgba(0,0,0,0.05)' } }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: '12px', backgroundColor: '#F3F4F6', color: '#374151', display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 3 }}>
                    <GitHubIcon />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827', mb: 2 }}>
                    Open Source
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4B5563', lineHeight: 1.6, mb: 0 }}>
                    Mementos is fully open source. You can view, fork, and contribute to the code on{' '}
                    <Link href="https://github.com/ML72/Mementos" target="_blank" rel="noopener noreferrer" sx={{ color: '#0A66C2', textDecoration: 'none', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}>
                      GitHub
                    </Link>.
                  </Typography>
                </Paper>
              </Grid2>
            </Grid2>
          </Container>
        </Box>
      </Box>
    </CustomPage>
  );
};

export default About;
