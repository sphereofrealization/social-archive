import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { 
  Facebook, 
  Instagram, 
  Twitter, 
  Linkedin, 
  Music2,
  ArrowRight,
  Shield,
  Download,
  Trash2,
  CheckCircle2
} from "lucide-react";

const platforms = [
  {
    name: "Facebook",
    icon: Facebook,
    description: "Download your posts, photos, messages, and friends list"
  },
  {
    name: "Instagram",
    icon: Instagram,
    description: "Save your photos, stories, reels, and DMs"
  },
  {
    name: "Twitter",
    icon: Twitter,
    description: "Archive your tweets, likes, and followers"
  },
  {
    name: "LinkedIn",
    icon: Linkedin,
    description: "Backup your connections, posts, and messages"
  },
  {
    name: "TikTok",
    icon: Music2,
    description: "Download your videos, likes, and comments"
  },
];

export default function Dashboard() {
  const { data: archives = [] } = useQuery({
    queryKey: ['archives'],
    queryFn: () => base44.entities.Archive.list('-updated_date'),
    initialData: [],
  });

  const getArchiveStatus = (platformName) => {
    return archives.find(a => a.platform.toLowerCase() === platformName.toLowerCase());
  };

  const completedCount = archives.filter(a => a.status === 'organized' || a.status === 'deleted').length;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 border-b-4 border-black pb-6">
        <h1 className="text-5xl font-bold text-black mb-3 uppercase tracking-wider">
          ▸ Social Media Archive System ◂
        </h1>
        <p className="text-2xl text-black uppercase tracking-wide">
          Download · Organize · Backup · Delete
        </p>
      </div>
      
      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="mac-pixel-border p-6">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle2 className="w-10 h-10" style={{ strokeWidth: 3 }} />
            <div>
              <p className="text-4xl font-bold text-black">{completedCount}</p>
              <p className="text-xl text-black uppercase">Archives Done</p>
            </div>
          </div>
        </div>

        <div className="mac-pixel-border p-6">
          <div className="flex items-center gap-3 mb-3">
            <Download className="w-10 h-10" style={{ strokeWidth: 3 }} />
            <div>
              <p className="text-4xl font-bold text-black">{archives.length}</p>
              <p className="text-xl text-black uppercase">Total Archives</p>
            </div>
          </div>
        </div>

        <div className="mac-pixel-border p-6">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-10 h-10" style={{ strokeWidth: 3 }} />
            <div>
              <p className="text-4xl font-bold text-black">100%</p>
              <p className="text-xl text-black uppercase">Ownership</p>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="mac-pixel-border p-6 mb-8">
        <h2 className="text-3xl font-bold mb-6 uppercase border-b-3 border-black pb-2">
          :: How It Works ::
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="border-3 border-black p-4 bg-white">
            <div className="w-16 h-16 bg-black text-white flex items-center justify-center text-4xl font-bold mb-4 mx-auto">
              1
            </div>
            <h3 className="text-2xl font-bold mb-2 uppercase text-center">Request Data</h3>
            <p className="text-lg text-center">Follow guides to request downloads</p>
          </div>
          <div className="border-3 border-black p-4 bg-white">
            <div className="w-16 h-16 bg-black text-white flex items-center justify-center text-4xl font-bold mb-4 mx-auto">
              2
            </div>
            <h3 className="text-2xl font-bold mb-2 uppercase text-center">Upload Here</h3>
            <p className="text-lg text-center">Upload archives for organization</p>
          </div>
          <div className="border-3 border-black p-4 bg-white">
            <div className="w-16 h-16 bg-black text-white flex items-center justify-center text-4xl font-bold mb-4 mx-auto">
              3
            </div>
            <h3 className="text-2xl font-bold mb-2 uppercase text-center">Safe Delete</h3>
            <p className="text-lg text-center">Use checklist to delete accounts</p>
          </div>
        </div>
      </div>

      {/* Platforms */}
      <div>
        <h2 className="text-3xl font-bold text-black mb-6 uppercase">
          :: Select Platform ::
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {platforms.map((platform) => {
            const archive = getArchiveStatus(platform.name);
            const Icon = platform.icon;
            
            return (
              <div key={platform.name} className="mac-pixel-border p-6 hover:translate-x-1 hover:translate-y-1 transition-transform">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-16 h-16 border-3 border-black bg-white flex items-center justify-center">
                    <Icon className="w-10 h-10 text-black" style={{ strokeWidth: 3 }} />
                  </div>
                  {archive && (
                    <div className="border-2 border-black px-3 py-1 bg-white">
                      <span className="text-sm uppercase font-bold">{archive.status.replace('_', ' ')}</span>
                    </div>
                  )}
                </div>
                <h3 className="text-2xl font-bold mb-2 uppercase">{platform.name}</h3>
                <p className="text-lg mb-4">{platform.description}</p>
                <Link to={createPageUrl(`Guide_${platform.name}`)}>
                  <button className="mac-button w-full py-3 px-4 flex items-center justify-center gap-2">
                    Start Archive
                    <ArrowRight className="w-5 h-5" style={{ strokeWidth: 3 }} />
                  </button>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="mac-pixel-border p-6 bg-white">
          <h3 className="text-2xl font-bold mb-3 uppercase flex items-center gap-2">
            <Download className="w-6 h-6" style={{ strokeWidth: 3 }} />
            Need Help?
          </h3>
          <p className="text-lg mb-4">
            Visit detailed guides for downloading your data
          </p>
          <Link to={createPageUrl("Guides")}>
            <button className="mac-button w-full py-2">View All Guides</button>
          </Link>
        </div>

        <div className="mac-pixel-border p-6 bg-white">
          <h3 className="text-2xl font-bold mb-3 uppercase flex items-center gap-2">
            <Trash2 className="w-6 h-6" style={{ strokeWidth: 3 }} />
            Ready to Delete?
          </h3>
          <p className="text-lg mb-4">
            Use our comprehensive deletion checklist
          </p>
          <Link to={createPageUrl("Checklist")}>
            <button className="mac-button w-full py-2">View Checklist</button>
          </Link>
        </div>
      </div>
    </div>
  );
}