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
    color: "#3b5998",
    description: "Download your posts, photos, messages, and friends list"
  },
  {
    name: "Instagram",
    icon: Instagram,
    color: "#e1306c",
    description: "Save your photos, stories, reels, and DMs"
  },
  {
    name: "Twitter",
    icon: Twitter,
    color: "#1da1f2",
    description: "Archive your tweets, likes, and followers"
  },
  {
    name: "LinkedIn",
    icon: Linkedin,
    color: "#0077b5",
    description: "Backup your connections, posts, and messages"
  },
  {
    name: "TikTok",
    icon: Music2,
    color: "#000000",
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
      <div className="mb-6">
        <div className="win98-window">
          <div className="win98-titlebar">
            <div className="w-4 h-4 bg-yellow-400"></div>
            <span>Welcome to Social Archive System</span>
          </div>
          <div className="p-6 bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100">
            <h1 className="text-4xl font-bold text-[#0000aa] mb-2">
              🎉 Social Media Archive System 🎉
            </h1>
            <p className="text-xl text-[#a000a0] font-bold">
              Download → Organize → Backup → Delete
            </p>
          </div>
        </div>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="win98-window">
          <div className="win98-titlebar bg-gradient-to-r from-green-600 to-green-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Completed</span>
          </div>
          <div className="p-4 bg-gradient-to-br from-green-100 to-green-200 text-center">
            <p className="text-5xl font-bold text-green-800">{completedCount}</p>
            <p className="text-lg font-bold text-green-600">Archives Done</p>
          </div>
        </div>

        <div className="win98-window">
          <div className="win98-titlebar bg-gradient-to-r from-blue-600 to-blue-400">
            <Download className="w-4 h-4" />
            <span>Total</span>
          </div>
          <div className="p-4 bg-gradient-to-br from-blue-100 to-blue-200 text-center">
            <p className="text-5xl font-bold text-blue-800">{archives.length}</p>
            <p className="text-lg font-bold text-blue-600">Total Archives</p>
          </div>
        </div>

        <div className="win98-window">
          <div className="win98-titlebar bg-gradient-to-r from-purple-600 to-purple-400">
            <Shield className="w-4 h-4" />
            <span>Security</span>
          </div>
          <div className="p-4 bg-gradient-to-br from-purple-100 to-purple-200 text-center">
            <p className="text-5xl font-bold text-purple-800">100%</p>
            <p className="text-lg font-bold text-purple-600">Data Ownership</p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="win98-window mb-6">
        <div className="win98-titlebar bg-gradient-to-r from-orange-600 to-yellow-400">
          <div className="w-4 h-4 bg-white rounded-full"></div>
          <span>How It Works - Step by Step Guide</span>
        </div>
        <div className="p-6 bg-gradient-to-br from-yellow-50 to-orange-50">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="win98-panel bg-gradient-to-br from-pink-100 to-pink-200">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                1
              </div>
              <h3 className="text-xl font-bold text-center text-pink-800 mb-2">Request Data</h3>
              <p className="text-center text-pink-700">Follow our guides to request downloads from each platform</p>
            </div>
            <div className="win98-panel bg-gradient-to-br from-blue-100 to-blue-200">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                2
              </div>
              <h3 className="text-xl font-bold text-center text-blue-800 mb-2">Upload Here</h3>
              <p className="text-center text-blue-700">Upload your downloaded archives for AI-powered organization</p>
            </div>
            <div className="win98-panel bg-gradient-to-br from-green-100 to-green-200">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                3
              </div>
              <h3 className="text-xl font-bold text-center text-green-800 mb-2">Safe Delete</h3>
              <p className="text-center text-green-700">Use our checklist to safely delete your accounts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Platforms */}
      <div className="win98-window mb-6">
        <div className="win98-titlebar bg-gradient-to-r from-purple-600 to-pink-400">
          <div className="w-4 h-4 bg-cyan-300"></div>
          <span>Select a Platform to Get Started</span>
        </div>
        <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {platforms.map((platform) => {
              const archive = getArchiveStatus(platform.name);
              const Icon = platform.icon;
              
              return (
                <div key={platform.name} className="win98-window hover:translate-y-[-2px] transition-transform">
                  <div className="win98-titlebar" style={{ background: `linear-gradient(90deg, ${platform.color} 0%, ${platform.color}dd 100%)` }}>
                    <Icon className="w-4 h-4" />
                    <span>{platform.name}</span>
                  </div>
                  <div className="p-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center shadow-lg" style={{ background: `linear-gradient(135deg, ${platform.color} 0%, ${platform.color}88 100%)` }}>
                        <Icon className="w-10 h-10 text-white" />
                      </div>
                      {archive && (
                        <div className="win98-button text-xs px-2 py-1">
                          {archive.status.replace('_', ' ').toUpperCase()}
                        </div>
                      )}
                    </div>
                    <p className="text-sm mb-4 text-gray-700">{platform.description}</p>
                    <Link to={createPageUrl(`Guide_${platform.name}`)}>
                      <button className="win98-button w-full flex items-center justify-center gap-2">
                        <span>Start Archive</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="win98-window">
          <div className="win98-titlebar bg-gradient-to-r from-teal-600 to-cyan-400">
            <Download className="w-4 h-4" />
            <span>Need Help?</span>
          </div>
          <div className="p-6 bg-gradient-to-br from-cyan-50 to-teal-50">
            <h3 className="text-xl font-bold mb-2 text-teal-800">📚 Platform Guides</h3>
            <p className="mb-4 text-teal-700">Visit our detailed guides for step-by-step instructions</p>
            <Link to={createPageUrl("Guides")}>
              <button className="win98-button w-full">View All Guides</button>
            </Link>
          </div>
        </div>

        <div className="win98-window">
          <div className="win98-titlebar bg-gradient-to-r from-red-600 to-pink-400">
            <Trash2 className="w-4 h-4" />
            <span>Ready to Delete?</span>
          </div>
          <div className="p-6 bg-gradient-to-br from-pink-50 to-red-50">
            <h3 className="text-xl font-bold mb-2 text-red-800">✓ Deletion Checklist</h3>
            <p className="mb-4 text-red-700">Make sure you've backed up everything important</p>
            <Link to={createPageUrl("Checklist")}>
              <button className="win98-button w-full">View Checklist</button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}