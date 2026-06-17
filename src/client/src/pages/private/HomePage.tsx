import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Paper, Grid,
  Button, Stack, Avatar, Chip, CircularProgress, Divider 
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store/store';
import { getFeed } from '../../service/notes';
import CustomPage from '../../components/layout/CustomPage';
import ExpandableText from '../../components/layout/ExpandableText';
import MarkdownViewer from '../../components/layout/MarkdownViewer';
import LikeButton from '../../components/layout/LikeButton';
import { useNoteLikes } from '../../hooks/useNoteLikes';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

const HomePage: React.FC = () => {
  const { email, userId, fullName, token } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const { isLiked, likeCountFor, toggleLike } = useNoteLikes();

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      const data = await getFeed(dispatch);
      if (data) {
        setNotes(data.notes || []);
        setHasMore(Boolean(data.hasMore));
      }
      setLoading(false);
    };

    if (token) {
      fetchNotes();
    }
  }, [dispatch, token]);

  // The feed is stateful, so re-fetching returns the next-best page. Append only
  // notes we don't already have (dedupe by id) in case content overlaps.
  const handleLoadMore = async () => {
    setLoadingMore(true);
    const data = await getFeed(dispatch);
    if (data) {
      setNotes(prev => {
        const seen = new Set(prev.map((n: any) => n._id));
        const fresh = (data.notes || []).filter((n: any) => !seen.has(n._id));
        return [...prev, ...fresh];
      });
      setHasMore(Boolean(data.hasMore));
    }
    setLoadingMore(false);
  };

  const getInitial = (nameOrEmail?: string | null) => {
    if (!nameOrEmail) return '?';
    return nameOrEmail.charAt(0).toUpperCase();
  };

  const displayName = (user?: any) => {
    if (!user) return 'Unknown User';
    return user.profile?.fullName || user.fullName || user.login?.email || 'Unknown User';
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
            
            {/* Navigation and Actions */}
            <Grid size={{ xs: 12, md: 8 }}>
              
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
                    Welcome to your dashboard
                  </Typography>
                </Box>
                <Typography variant="body1" sx={{ color: '#4B5563', mb: 3 }}>
                  Capture new insights or review your past notes. Your memory joggers are ready for you.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button
                    variant="contained"
                    href="/notes/new"
                    sx={{ 
                      px: 3,
                      py: 1.5,
                      fontWeight: 600,
                      backgroundColor: '#000000', 
                      color: '#ffffff', 
                      borderRadius: '8px',
                      textTransform: 'none',
                      boxShadow: 'none',
                      '&:hover': { backgroundColor: '#333333', boxShadow: 'none' }
                    }}
                  >
                    Create a New Note
                  </Button>
                  <Button
                    variant="outlined"
                    href="/notes"
                    sx={{ 
                      px: 3,
                      py: 1.5,
                      fontWeight: 600,
                      color: '#374151', 
                      borderColor: '#D1D5DB',
                      borderRadius: '8px',
                      textTransform: 'none',
                      '&:hover': { backgroundColor: '#F3F4F6', borderColor: '#9CA3AF' }
                    }}
                  >
                    View My Notes
                  </Button>
                </Stack>
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
                <>
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
                        <Box
                          onClick={() => {
                            if (note.creator?._id) {
                              window.location.href = `/profile/${note.creator._id}`;
                            }
                          }}
                          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', '&:hover': { opacity: 0.8 } }}
                        >
                          <Avatar sx={{ width: 36, height: 36, bgcolor: '#F3F4F6', color: '#4B5563', mr: 2, fontSize: '0.9rem', fontWeight: 600 }}>
                            {getInitial(displayName(note.creator))}
                          </Avatar>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#111827' }}>
                              {displayName(note.creator)}
                            </Typography>
                          </Box>
                        </Box>
                        <Box sx={{ ml: 1 }}>
                          <Typography variant="caption" sx={{ color: '#6B7280' }}>
                            • {formatDate(note.dateCreated)}
                          </Typography>
                        </Box>
                      </Box>
                      
                      <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', mb: 1.5, lineHeight: 1.3 }}>
                        {note.subject}
                      </Typography>
                      
                      <ExpandableText text={note.content} maxLength={250} />

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mt: 2 }}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
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
                        <LikeButton
                          liked={isLiked(note._id)}
                          count={likeCountFor(note)}
                          onToggle={() => toggleLike(note)}
                          readOnly={note.creator?._id === userId}
                        />
                      </Box>
                    </Paper>
                  ))}
                </Stack>
                {hasMore && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                    <Button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      variant="outlined"
                      sx={{
                        px: 4,
                        py: 1.25,
                        fontWeight: 600,
                        color: '#374151',
                        borderColor: '#D1D5DB',
                        borderRadius: '8px',
                        textTransform: 'none',
                        '&:hover': { backgroundColor: '#F3F4F6', borderColor: '#9CA3AF' }
                      }}
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </Button>
                  </Box>
                )}
                </>
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
