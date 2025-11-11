import Dashboard from './pages/Dashboard';
import Guides from './pages/Guides';
import guideFacebook from './pages/Guide_Facebook';
import Archives from './pages/Archives';
import Checklist from './pages/Checklist';
import Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Guides": Guides,
    "Guide_Facebook": guideFacebook,
    "Archives": Archives,
    "Checklist": Checklist,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: Layout,
};