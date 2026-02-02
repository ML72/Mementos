import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { RootState } from "../../store/store";

interface PublicPageProps {
  children: React.ReactNode;
}

/**
 * PublicPage component
 * Renders children only if the user has no roles (not authenticated).
 * If the user has any roles, redirects to /home.
 */
const PublicPage: React.FC<PublicPageProps> = ({ children }) => {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/home", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) {
    return null;
  }


  return <React.Fragment>{children}</React.Fragment>;
};

export default PublicPage;
