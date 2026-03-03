import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Paper, Grid, TextField, 
  Button, Stack, Avatar, Chip, CircularProgress, Divider 
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store/store';
import { setNewAlert } from '../../service/alert';
import { getFeed, createNote } from '../../service/notes';
import CustomPage from '../../components/layout/CustomPage';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

const HomePage: React.FC = () => {
  const { email, userId, fullName, token } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      const data = await getFeed(dispatch);
      if (data) {
        setNotes(data);
      }
      setLoading(false);
    };

    if (token) {
      fetchNotes();
    }
  }, [dispatch, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !content) {
      setNewAlert(dispatch, { msg: 'Subject and content are required', alertType: 'error' });
      return;
    }
    
    setSubmitting(true);
    const tagsArray = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const res = await createNote(dispatch, { subject, content, tags: tagsArray });
    
    if (res) {
      // Manually populate creator for immediate UI update
      const newNote = res;
      newNote.creator = { _id: userId, login: { email }, fullName };

      setNotes([newNote, ...notes]);
      setSubject('');
      setContent('');
      setTags('');
    }
    setSubmitting(false);
  };

  const getInitial = (nameOrEmail?: string | null) => {
    if (!nameOrEmail) return '?';
    return nameOrEmail.charAt(0).toUpperCase();
  };

  const displayName = (user?: any) => {
    if (!user) return 'Unknown User';
    return user.fullName || user.login?.email || 'Unknown User';
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <CustomPage showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#F9FAFB', minHeight: 'calc(100vh - 65px)', pt: { xs: 4, md: 6 }, pb: 8 }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            
            {/* Main Feed Column */}
            <Grid size={{ xs: 12, md: 8 }}>
              
              {/* Note Creation Card */}
              <Paper elevation={0} sx={{ 
                p: { xs: 3, md: 4 }, 
                mb: 4,
                borderRadius: '16px',
                border: '1px solid #E5E7EB',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                backgroundColor: '#ffffff'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                  <AutoAwesomeIcon sx={{ color: '#000', mr: 1.5 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827' }}>
                    Capture Insight
                  </Typography>
                </Box>
                <Box component="form" onSubmit={handleSubmit}>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      placeholder="What's the main idea?"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      variant="standard"
                      InputProps={{
                        disableUnderline: true,
                        sx: { fontSize: '1.25rem', fontWeight: 600, color: '#111827' }
                      }}
                    />
                    <TextField
                      fullWidth
                      multiline
                      minRows={2}
                      placeholder="Write down the details... we'll build a memory jog for you later."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      variant="standard"
                      InputProps={{
                        disableUnderline: true,
                        sx: { fontSize: '1.05rem', color: '#4B5563', lineHeight: 1.6 }
                      }}
                    />
                    <Divider sx={{ my: 1.5 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                      <TextField
                        placeholder="Tags (comma separated)"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        variant="standard"
                        InputProps={{
                          disableUnderline: true,
                          sx: { fontSize: '0.9rem', color: '#6B7280' }
                        }}
                        sx={{ width: { xs: '100%', sm: '60%' } }}
                      />
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={submitting}
                        endIcon={<SendIcon />}
                        sx={{ 
                          px: 3,
                          py: 1,
                          fontWeight: 600,
                          backgroundColor: '#000000', 
                          color: '#ffffff', 
                          borderRadius: '8px',
                          textTransform: 'none',
                          boxShadow: 'none',
                          '&:hover': { backgroundColor: '#333333', boxShadow: 'none' }
                        }}
                      >
                        Save Note
                      </Button>
                    </Box>
                  </Stack>
                </Box>
              </Paper>

              <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 3 }}>
                Your Learning Feed
              </Typography>

              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                  <CircularProgress size={40} sx={{ color: '#000' }} />
                </Box>
              ) : notes.length === 0 ? (
                <Paper elevation={0} sx={{ p: 6, textAlign: 'center', borderRadius: '16px', border: '1px dashed #E5E7EB', backgroundColor: 'transparent' }}>
                  <Typography variant="h6" sx={{ color: '#6B7280', fontWeight: 500 }}>No insights yet.</Typography>
                  <Typography variant="body2" sx={{ color: '#9CA3AF', mt: 1 }}>Be the first to capture something interesting!</Typography>
                </Paper>
              ) : (
                <Stack spacing={3}>
                  {notes.map((note) => (
                    <Paper key={note._id} elevation={0} sx={{ 
                      p: { xs: 3, md: 4 }, 
                      borderRadius: '16px',
                      border: '1px solid #E5E7EB',
                      backgroundColor: '#ffffff',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)'
                      }
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: '#F3F4F6', color: '#4B5563', mr: 2, fontSize: '0.9rem', fontWeight: 600 }}>
                          {getInitial(displayName(note.creator))}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#111827' }}>
                            {displayName(note.creator)}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#6B7280' }}>
                            {formatDate(note.dateCreated)}
                          </Typography>
                        </Box>
                      </Box>
                      
                      <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', mb: 1.5, lineHeight: 1.3 }}>
                        {note.subject}
                      </Typography>
                      
                      <Typography variant="body1" sx={{ color: '#4B5563', lineHeight: 1.7, mb: 3 }}>
                        {note.content}
                      </Typography>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Stack direction="row" spacing={1}>
                          {note.tags && note.tags.map((tag: string, idx: number) => (
                            <Chip 
                              key={idx} 
                              label={tag} 
                              size="small" 
                              sx={{ 
                                backgroundColor: '#F3F4F6', 
                                color: '#4B5563',
                                fontWeight: 500,
                                borderRadius: '6px'
                              }} 
                            />
                          ))}
                        </Stack>
                      </Box>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Grid>

            {/* Sidebar Column */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ position: 'sticky', top: 100 }}>
                <Paper elevation={0} sx={{ 
                  p: 3, 
                  borderRadius: '16px',
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#ffffff'
                }}>
                   <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                      <Avatar sx={{ width: 48, height: 48, bgcolor: '#000', color: '#fff', mr: 2 }}>
                        {getInitial(fullName || email)}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
                          {fullName || email?.split('@')[0]}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#6B7280' }}>
                          Lifelong Learner
                        </Typography>
                      </Box>
                   </Box>
                   <Divider sx={{ my: 2 }} />
                   <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                     <Typography variant="body2" sx={{ color: '#4B5563', fontWeight: 500 }}>Total Insights Captured</Typography>
                     <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700 }}>
                       {notes.filter(n => n.creator?._id === userId || n.creator === userId).length}
                     </Typography>
                   </Box>
                   <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                     <Typography variant="body2" sx={{ color: '#4B5563', fontWeight: 500 }}>Memory Jogs Active</Typography>
                     <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700 }}>True</Typography>
                   </Box>
                </Paper>

                <Paper elevation={0} sx={{ 
                  mt: 3,
                  p: 3, 
                  borderRadius: '16px',
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#F9FAFB'
                }}>
                   <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
                     How the Replay Buffer works
                   </Typography>
                   <Typography variant="body2" sx={{ color: '#6B7280', lineHeight: 1.6 }}>
                     Every week, our system emails you a curated selection of your notes as well as insights from people you follow, reinforcing your knowledge retention right when you need it.
                   </Typography>
                </Paper>
              </Box>
            </Grid>

          </Grid>
        </Container>
      </Box>
    </CustomPage>
  );
};

export default HomePage;
