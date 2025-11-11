import Dashboard from './pages/Dashboard';
import Guides from './pages/Guides';
import guideFacebook from './pages/Guide_Facebook';
import Archives from './pages/Archives';
import Checklist from './pages/Checklist';
import guideInstagram from './pages/Guide_Instagram';
import guideTwitter from './pages/Guide_Twitter';
import guideLinkedin from './pages/Guide_LinkedIn';
import guideTiktok from './pages/Guide_TikTok';
import Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Guides": Guides,
    "Guide_Facebook": guideFacebook,
    "Archives": Archives,
    "Checklist": Checklist,
    "Guide_Instagram": guideInstagram,
    "Guide_Twitter": guideTwitter,
    "Guide_LinkedIn": guideLinkedin,
    "Guide_TikTok": guideTiktok,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: Layout,
};