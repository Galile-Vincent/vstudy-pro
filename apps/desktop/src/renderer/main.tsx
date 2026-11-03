import { I18nextProvider } from "react-i18next";
import { i18n } from "../shared/i18n";
import { tr } from '../shared/i18n';
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./style.css";
import "./tokens.css";
const root = document.getElementById("root");
if (!root) throw new Error(tr('common:missing_application_root'));
createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}><App /></I18nextProvider>
  </StrictMode>,
);
