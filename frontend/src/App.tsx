import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { InvestorProvider } from "./lib/investor-context";
import Overview from "./pages/Overview";
import Discover from "./pages/Discover";
import StartupDetail from "./pages/StartupDetail";
import Feed from "./pages/Feed";
import Alerts from "./pages/Alerts";
import Model from "./pages/Model";
import Submit from "./pages/Submit";
import Onboarding from "./pages/Onboarding";

export default function App() {
  return (
    <BrowserRouter>
      <InvestorProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/startup/:id" element={<StartupDetail />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/model" element={<Model />} />
            <Route path="/submit" element={<Submit />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </InvestorProvider>
    </BrowserRouter>
  );
}
