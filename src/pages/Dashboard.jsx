import React, { useState } from "react";
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
      <div className="mb-8">
        <div className="mac-window">
          <div className="mac-titlebar mac-titlebar-active">
            <div className="mac-dots">
              <div className="mac-dot mac-dot-close"></div>
              <div className="mac-dot mac-dot-minimize"></div>
              <div className="mac-dot mac-dot-maximize"></div>
            </div>
            <span className="flex-1 text-center">Welcome</span>
          </div>
          <div className="p-8 bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
              Social Media Archive System
            </h1>
            <p className="text-xl text-gray-700 font-medium">
              Download → Organize → Backup → Delete
            </p>
          </div>
        </div>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="mac-window">
          <div className="mac-titlebar">
            <div className="mac-dots">
              <div className="mac-dot mac-dot-close"></div>
              <div className="mac-dot mac-dot-minimize"></div>
              <div className="mac-dot mac-dot-maximize"></div>
            </div>
            <CheckCircle2 className="w-4 h-4 ml-2" />
            <span>Completed</span>
          </div>
          <div className="p-6 bg-gradient-to-br from-green-100 to-green-200 text-center">
            <p className="text-6xl font-bold text-green-700">{completedCount}</p>
            <p className="text-lg font-semibold text-green-600 mt-2">Archives Done</p>
          </div>
        </div>

        <div className="mac-window">
          <div className="mac-titlebar">
            <div className="mac-dots">
              <div className="mac-dot mac-dot-close"></div>
              <div className="mac-dot mac-dot-minimize"></div>
              <div className="mac-dot mac-dot-maximize"></div>
            </div>
            <Download className="w-4 h-4 ml-2" />
            <span>Total</span>
          </div>
          <div className="p-6 bg-gradient-to-br from-blue-100 to-blue-200 text-center">
            <p className="text-6xl font-bold text-blue-700">{archives.length}</p>
            <p className="text-lg font-semibold text-blue-600 mt-2">Total Archives</p>
          </div>
        </div>

        <div className="mac-window">
          <div className="mac-titlebar">
            <div className="mac-dots">
              <div className="mac-dot mac-dot-close"></div>
              <div className="mac-dot mac-dot-minimize"></div>
              <div className="mac-dot mac-dot-maximize"></div>
            </div>
            <Shield className="w-4 h-4 ml-2" />
            <span>Security</span>
          </div>
          <div className="p-6 bg-gradient-to-br from-purple-100 to-purple-200 text-center">
            <p className="text-6xl font-bold text-purple-700">100%</p>
            <p className="text-lg font-semibold text-purple-600 mt-2">Data Ownership</p>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="mac-window mb-8">
        <div className="mac-titlebar">
          <div className="mac-dots">
            <div className="mac-dot mac-dot-close"></div>
            <div className="mac-dot mac-dot-minimize"></div>
            <div className="mac-dot mac-dot-maximize"></div>
          </div>
          <span className="flex-1 text-center">How It Works</span>
        </div>
        <div className="p-8 bg-gradient-to-br from-yellow-50 to-orange-50">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="mac-panel bg-gradient-to-br from-pink-50 to-pink-100">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-pink-400 to-red-400 flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                1
              </div>
              <h3 className="text-xl font-bold text-center text-pink-700 mb-2">Request Data</h3>
              <p className="text-center text-gray-700">Follow our guides to request downloads from each platform</p>
            </div>
            <div className="mac-panel bg-gradient-to-br from-blue-50 to-blue-100">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                2
              </div>
              <h3 className="text-xl font-bold text-center text-blue-700 mb-2">Upload Here</h3>
              <p className="text-center text-gray-700">Upload your downloaded archives for AI-powered organization</p>
            </div>
            <div className="mac-panel bg-gradient-to-br from-green-50 to-green-100">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-400 to-teal-400 flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                3
              </div>
              <h3 className="text-xl font-bold text-center text-green-700 mb-2">Safe Delete</h3>
              <p className="text-center text-gray-700">Use our checklist to safely delete your accounts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Platforms */}
      <div className="mac-window mb-8">
        <div className="mac-titlebar">
          <div className="mac-dots">
            <div className="mac-dot mac-dot-close"></div>
            <div className="mac-dot mac-dot-minimize"></div>
            <div className="mac-dot mac-dot-maximize"></div>
          </div>
          <span className="flex-1 text-center">Select a Platform</span>
        </div>
        <div className="p-8 bg-gradient-to-br from-purple-50 to-pink-50">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {platforms.map((platform) => {
              const archive = getArchiveStatus(platform.name);
              const Icon = platform.icon;
              
              return (
                <div key={platform.name} className="mac-window hover:translate-y-[-2px] transition-transform">
                  <div className="mac-titlebar">
                    <div className="mac-dots">
                      <div className="mac-dot mac-dot-close"></div>
                      <div className="mac-dot mac-dot-minimize"></div>
                      <div className="mac-dot mac-dot-maximize"></div>
                    </div>
                    <Icon className="w-4 h-4 ml-2" />
                    <span>{platform.name}</span>
                  </div>
                  <div className="p-6 bg-white">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-16 h-16 rounded-xl flex items-center justify-center shadow-lg" style={{ background: `linear-gradient(135deg, ${platform.color} 0%, ${platform.color}aa 100%)` }}>
                        <Icon className="w-9 h-9 text-white" />
                      </div>
                      {archive && (
                        <div className="text-xs font-semibold px-3 py-1 rounded bg-blue-100 text-blue-700 border border-blue-300">
                          {archive.status.replace('_', ' ').toUpperCase()}
                        </div>
                      )}
                    </div>
                    <p className="text-sm mb-5 text-gray-700 leading-relaxed">{platform.description}</p>
                    <Link to={createPageUrl(`Guide_${platform.name}`)}>
                      <button className="mac-button w-full flex items-center justify-center gap-2">
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
      <div className="grid md:grid-cols-2 gap-6">
        <div className="mac-window">
          <div className="mac-titlebar">
            <div className="mac-dots">
              <div className="mac-dot mac-dot-close"></div>
              <div className="mac-dot mac-dot-minimize"></div>
              <div className="mac-dot mac-dot-maximize"></div>
            </div>
            <Download className="w-4 h-4 ml-2" />
            <span>Need Help?</span>
          </div>
          <div className="p-6 bg-gradient-to-br from-cyan-50 to-teal-50">
            <h3 className="text-2xl font-bold mb-2 text-teal-700">Platform Guides</h3>
            <p className="mb-5 text-gray-700">Visit our detailed guides for step-by-step instructions</p>
            <Link to={createPageUrl("Guides")}>
              <button className="mac-button w-full">View All Guides</button>
            </Link>
          </div>
        </div>

        <div className="mac-window">
          <div className="mac-titlebar">
            <div className="mac-dots">
              <div className="mac-dot mac-dot-close"></div>
              <div className="mac-dot mac-dot-minimize"></div>
              <div className="mac-dot mac-dot-maximize"></div>
            </div>
            <Trash2 className="w-4 h-4 ml-2" />
            <span>Ready to Delete?</span>
          </div>
          <div className="p-6 bg-gradient-to-br from-pink-50 to-red-50">
            <h3 className="text-2xl font-bold mb-2 text-red-700">Deletion Checklist</h3>
            <p className="mb-5 text-gray-700">Make sure you've backed up everything important</p>
            <Link to={createPageUrl("Checklist")}>
              <button className="mac-button w-full">View Checklist</button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}