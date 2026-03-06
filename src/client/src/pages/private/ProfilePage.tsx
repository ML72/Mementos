import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Paper, Grid, Avatar, Button, Stack, CircularProgress, Chip 
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { useParams } from 'react-router-dom';
import { RootState } from '../../store/store';
import { setNewAlert } from '../../service/alert';
import CustomPage from '../../components/layout/CustomPage';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import { getUserProfile, followUser, unfollowUser } from '../../service/user';
import { getUserNotes } from '../../service/notes';
import ExpandableText from '../../components/layout/ExpandableText';

const ProfilePage: React.FC = () => {
  const { userId: profileId } = useParams<{ userId: string }>();
  const { userId: currentUserId } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileUser, setProfileUser] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!profileId) return;
      setLoading(true);
      
      const profileResult = await getUserProfile(dispatch, profileId);
      if (profileResult) {
        setProfileUser(profileResult);
        setIsFollowing(profileResult.followers?.includes(currentUserId));
      }

      const notesResult = await getUserNotes(dispatch, profileId);
      if (notesResult) {
        setNotes(notesResult);
      }
      
      setLoading(false);
    };

    fetchData();
  }, [profileId, currentUserId, dispatch]);

  const handleFollowToggle = async () => {
    if (!profileId || followLoading) return;
    setFollowLoading(true);
    
    if (isFollowing) {
      const success = await unfollowUser(dispatch, profileId);
      if (success) {
        setIsFollowing(false);
        setProfileUser((prev: any) => ({
          ...prev,
          followerCount: Math.max(0, prev.followerCount - 1),
          followers: prev.followers.filter((id: string) => id !== currentUserId)
        }));
      }
    } else {
      const success = await followUser(dispatch, profileId);
      if (success) {
        setIsFollowing(true);
        setProfileUser((prev: any) => ({
          ...prev,
          followerCount: prev.followerCount + 1,
          followers: [...(prev.followers || []), currentUserId]
        }));
      }
    }
    setFollowLoading(false);
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
        <Container maxWidth="md">
          
          {/* Profile Header Card */}
          <Paper elevation={0} sx={{ 
            p: { xs: 3, md: 4 }, 
            mb: 4,
            borderRadius: '16px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Avatar sx={{ width: 80, height: 80, fontSize: '2rem', bgcolor: '#000', mr: 3 }}>
                {getInitial(displayName(profileUser))}
              </Avatar>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827' }}>
                  {displayName(profileUser)}
                </Typography>
                {profileUser?.bio && (
                  <Typography variant="body1" sx={{ color: '#4B5563', mt: 1, mb: 0.5, maxWidth: '600px' }}>
                    {profileUser.bio}
                  </Typography>
                )}
                <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.5 }}>
                  {profileUser?.followerCount || 0} Followers
                </Typography>
              </Box>
            </Box>
            
            {currentUserId !== profileId && (
              <Button
                variant={isFollowing ? "outlined" : "contained"}
                onClick={handleFollowToggle}
                startIcon={isFollowing ? <PersonRemoveIcon /> : <PersonAddIcon />}
                sx={{ 
                  px: 3, py: 1, fontWeight: 600, borderRadius: '8px', textTransform: 'none',
                  ...(isFollowing ? {
                    color: '#000', borderColor: '#000',
                    '&:hover': { backgroundColor: '#F3F4F6', borderColor: '#000' }
                  } : {
                    backgroundColor: '#000', color: '#fff', boxShadow: 'none',
                    '&:hover': { backgroundColor: '#333', boxShadow: 'none' }
                  })
                }}
              >
                {isFollowing ? 'Unfollow' : 'Follow'}
              </Button>
            )}
          </Paper>

          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 3 }}>
            Recent Notes
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={40} sx={{ color: '#000' }} />
            </Box>
          ) : notes.length === 0 ? (
            <Paper elevation={0} sx={{ p: 6, textAlign: 'center', borderRadius: '16px', border: '1px dashed #E5E7EB', backgroundColor: 'transparent' }}>
              <Typography variant="h6" sx={{ color: '#6B7280', fontWeight: 500 }}>No notes yet.</Typography>
              <Typography variant="body2" sx={{ color: '#9CA3AF', mt: 1 }}>{displayName(profileUser)} hasn't shared anything recently.</Typography>
            </Paper>
          ) : (
            <Stack spacing={3}>
              {notes.map((note) => (
                <Paper key={note._id} elevation={0} sx={{ 
                  p: { xs: 3, md: 4 }, 
                  borderRadius: '16px',
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#ffffff'
                }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', mb: 1 }}>
                    {note.subject}
                  </Typography>
                  <ExpandableText text={note.content} maxLength={250} />
                </Paper>
              ))}
            </Stack>
          )}

        </Container>
      </Box>
    </CustomPage>
  );
};

export default ProfilePage;