// Google-like Material-UI v5 Theme
import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1a73e8", // Google Blue
      light: "#e8f0fe",
      dark: "#1557b0",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#1e8e3e", // Google Green
      light: "#e6f4ea",
      dark: "#137333",
      contrastText: "#ffffff",
    },
    error: {
      main: "#d93025", // Google Red
      light: "#fce8e6",
      dark: "#c5221f",
    },
    warning: {
      main: "#f9ab00", // Google Yellow/Amber
      light: "#fef7e0",
      dark: "#b06000",
    },
    info: {
      main: "#007b83", // Teal
      light: "#e4f7f6",
      dark: "#005a60",
    },
    text: {
      primary: "#202124", // Very dark grey (Google standard body text)
      secondary: "#5f6368", // Medium grey
      disabled: "#9aa0a6",
    },
    background: {
      default: "#f8f9fa", // Sleek, clean light background
      paper: "#ffffff",
    },
    divider: "#dadce0", // Soft grey divider
  },
  typography: {
    fontFamily: [
      "Inter",
      "Product Sans",
      "Google Sans",
      "Segoe UI",
      "Roboto",
      "Helvetica",
      "Arial",
      "sans-serif"
    ].join(","),
    h1: {
      fontSize: "2.25rem",
      fontWeight: 700,
      letterSpacing: "-0.03em",
      color: "#202124",
    },
    h2: {
      fontSize: "1.75rem",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      color: "#202124",
    },
    h3: {
      fontSize: "1.5rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      color: "#202124",
    },
    h4: {
      fontSize: "1.25rem",
      fontWeight: 600,
      color: "#202124",
    },
    h5: {
      fontSize: "1rem",
      fontWeight: 600,
      color: "#202124",
    },
    h6: {
      fontSize: "0.875rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "#5f6368",
    },
    body1: {
      fontSize: "0.875rem",
      lineHeight: 1.5,
      color: "#202124",
    },
    body2: {
      fontSize: "0.75rem",
      lineHeight: 1.4,
      color: "#5f6368",
    },
    button: {
      fontSize: "0.8125rem",
      fontWeight: 600,
      textTransform: "none", // No automatic uppercase to match Google UI style
      letterSpacing: "0.02em",
    },
    caption: {
      fontSize: "0.75rem",
      fontWeight: 500,
      letterSpacing: "0.01em",
    },
  },
  shape: {
    borderRadius: 12, // Google Workspace style rounded corners (12px is ideal)
  },
  shadows: [
    "none",
    "0px 1px 2px 0px rgba(60,64,67,0.3), 0px 1px 3px 1px rgba(60,64,67,0.15)", // standard Google elevation 1
    "0px 1px 2px 0px rgba(60,64,67,0.3), 0px 2px 6px 2px rgba(60,64,67,0.15)", // elevation 2
    "0px 1px 3px 0px rgba(60,64,67,0.3), 0px 4px 8px 3px rgba(60,64,67,0.15)", // elevation 3
    "0px 2px 3px 0px rgba(60,64,67,0.3), 0px 6px 10px 4px rgba(60,64,67,0.15)", // elevation 4
    "none", "none", "none", "none", "none", "none", "none", "none", "none", "none",
    "none", "none", "none", "none", "none", "none", "none", "none", "none", "none"
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 24, // Pill buttons are Google's signature
          padding: "6px 16px",
          fontWeight: 600,
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none",
          },
        },
        contained: {
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none",
          },
        },
        outlined: {
          borderColor: "#dadce0",
          color: "#1a73e8",
          "&:hover": {
            backgroundColor: "#f4f8fe",
            borderColor: "#1a73e8",
          },
        },
        text: {
          color: "#5f6368",
          "&:hover": {
            backgroundColor: "#f1f3f4",
            color: "#202124",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: "1px solid #dadce0",
          boxShadow: "none",
          transition: "box-shadow 0.2s ease-in-out, border-color 0.2s ease-in-out",
          "&:hover": {
            boxShadow: "0 1px 3px 1px rgba(60,64,67,0.15), 0 1px 2px 0 rgba(60,64,67,0.3)",
            borderColor: "#b8bdc4",
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          fontSize: "0.875rem",
          textTransform: "none",
          minWidth: 90,
          padding: "12px 16px",
          color: "#5f6368",
          "&.Mui-selected": {
            color: "#1a73e8",
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: "3px 3px 0 0",
          backgroundColor: "#1a73e8",
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: "2px 0",
          "&.Mui-selected": {
            backgroundColor: "#e8f0fe",
            color: "#1557b0",
            "&:hover": {
              backgroundColor: "#d2e3fc",
            },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 24,
          padding: 8,
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: "0.875rem",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          borderColor: "#dadce0",
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderWidth: 2,
            borderColor: "#1a73e8",
          },
        },
      },
    },
  },
});
export default theme;
