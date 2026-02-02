import React from 'react';
import { Alert as MUIAlert, Snackbar } from '@mui/material';
import { useSelector } from 'react-redux';
import { selectAlertState } from '../../store/slices/ui';

interface ComponentProps {

}

const Alert: React.FC<ComponentProps> = (props: ComponentProps) => {
  const alerts = useSelector(selectAlertState);

  // Responsive: bottom right on desktop, full width bottom center on mobile
  // Use a wrapper div for stacking and responsive positioning
  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 1400,
        bottom: 16,
        right: 16,
        left: 'auto',
        width: 'auto',
        maxWidth: 'calc(100vw - 32px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
      className="alert-stack-responsive"
    >
      {alerts.map((alert: any, index: number) => (
        <Snackbar
          open={true}
          key={alert.id || index}
          transitionDuration={300}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{
            mb: index * 7,
            width: '100%',
            maxWidth: 400,
            pointerEvents: 'auto',
            '@media (max-width:600px)': {
              left: 0,
              right: 0,
              width: 'calc(100vw - 16px)', // 8px margin on each side
              maxWidth: 'calc(100vw - 16px)',
              alignItems: 'center',
              '& .MuiPaper-root': { width: 'calc(100vw - 16px)', minWidth: 0 },
              marginLeft: '8px',
              marginRight: '8px',
            },
          }}
        >
          <MUIAlert severity={alert.alertType} sx={{ width: '100%' }} data-cy="alert">
            {alert.msg}
          </MUIAlert>
        </Snackbar>
      ))}
    </div>
  );
};

export default Alert;