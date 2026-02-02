
import React, { useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import { RootState } from "../../store/store";
import { AuthenticatedPageProps } from "../../../types/components/AuthenticatedPage.types";
import { setNewAlert } from "../../service/alert";

/**
 * AuthenticatedPage component
 * Renders children only if the user has at least one of the required roles.
 */

const AuthenticatedPage: React.FC<AuthenticatedPageProps> = ({ allowedRoles, children }) => {
  const { accountRoles, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // Prevent duplicate alerts on redirect
  const alertShownRef = useRef(false);

  const hasAccess =
    isAuthenticated &&
    Array.isArray(accountRoles) &&
    allowedRoles.some((role) => accountRoles.includes(role));

  useEffect(() => {
    if (alertShownRef.current) return;

    const timer = setTimeout(() => {
      // Prevent duplicate alerts if already on /login
      if (!isAuthenticated) {
        if (location.pathname !== "/login") {
          setNewAlert(dispatch, {
            msg: "Please log in to access this page.",
            alertType: "error"
          });
          alertShownRef.current = true;
          navigate("/login", { replace: true });
        }
      } else if (!hasAccess) {
        setNewAlert(dispatch, {
          msg: "Sorry, you do not seem to have access to this page.",
          alertType: "error"
        });
        alertShownRef.current = true;
        navigate("/", { replace: true });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [hasAccess, isAuthenticated, dispatch, navigate, location]);

  if (!hasAccess) {
    return <React.Fragment />;
  }

  return <React.Fragment>{children}</React.Fragment>;
};

export default AuthenticatedPage;
