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
    color: "from-blue-500 to-blue-600",
    textColor: "text-blue-600",
    bgColor: "bg-blue-50",
    description: "Download your posts, photos, messages, and friends list"
  },
  {
    name: "Instagram",
    icon: Instagram,
    color: "from-pink-500 to-purple-600",
    textColor: "text-pink-600",
    bgColor: "bg-pink-50",
    description: "Save your photos, stories, reels, and DMs"
  },
  {
    name: "Twitter",
    icon: Twitter,
    color: "from-sky-400 to-sky-600",
    textColor: "text-sky-600",
    bgColor: "bg-sky-50",
    description: "Archive your tweets, likes, and followers"
  },
  {
    name: "LinkedIn",
    icon: Linkedin,
    color: "from-blue-600 to-blue-700",
    textColor: "text-blue-700",
    bgColor: "bg-blue-50",
    description: "Backup your connections, posts, and messages"
  },
  {
    name: "TikTok",
    icon: Music2,
    color: "from-black to-gray-800",
    textColor: "text-gray-900",
    bgColor: "bg-gray-50",
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
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Take Control of Your Social Media Data
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            Download, organize, and safely backup your social media archives before deleting your accounts
          </p>
          
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="border-none shadow-md bg-gradient-to-br from-green-50 to-emerald-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{completedCount}</p>
                    <p className="text-sm text-gray-600">Archives Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-gradient-to-br from-blue-50 to-indigo-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Download className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{archives.length}</p>
                    <p className="text-sm text-gray-600">Total Archives</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-gradient-to-br from-purple-50 to-pink-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Shield className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">100%</p>
                    <p className="text-sm text-gray-600">Data Ownership</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* How It Works */}
        <Card className="mb-8 border-none shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">How It Works</CardTitle>
            <CardDescription>Follow these simple steps to archive your social media</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-blue-600">1</span>
                </div>
                <h3 className="font-semibold mb-2">Request Your Data</h3>
                <p className="text-sm text-gray-600">Follow our guides to request data downloads from each platform</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-purple-600">2</span>
                </div>
                <h3 className="font-semibold mb-2">Upload & Organize</h3>
                <p className="text-sm text-gray-600">Upload your downloaded archives and we'll help you organize them</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-green-600">3</span>
                </div>
                <h3 className="font-semibold mb-2">Safe Deletion</h3>
                <p className="text-sm text-gray-600">Use our checklist to safely delete your accounts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Platform Cards */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Select a Platform to Get Started</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {platforms.map((platform) => {
              const archive = getArchiveStatus(platform.name);
              const Icon = platform.icon;
              
              return (
                <Card key={platform.name} className="border-none shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
                  <div className={`h-2 bg-gradient-to-r ${platform.color}`} />
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <div className={`p-3 ${platform.bgColor} rounded-xl`}>
                        <Icon className={`w-6 h-6 ${platform.textColor}`} />
                      </div>
                      {archive && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          {archive.status.replace('_', ' ')}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl">{platform.name}</CardTitle>
                    <CardDescription className="text-sm">{platform.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Link to={createPageUrl(`Guide_${platform.name}`)}>
                      <Button className="w-full group-hover:translate-x-1 transition-transform duration-200">
                        Start Archive
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 grid md:grid-cols-2 gap-6">
          <Card className="border-none shadow-md bg-gradient-to-br from-amber-50 to-orange-50">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <Download className="w-5 h-5" />
                Need Help?
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Visit our detailed guides to learn how to download your data from any platform
              </p>
              <Link to={createPageUrl("Guides")}>
                <Button variant="outline">View All Guides</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md bg-gradient-to-br from-red-50 to-pink-50">
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Ready to Delete?
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Make sure you've backed up everything with our comprehensive deletion checklist
              </p>
              <Link to={createPageUrl("Checklist")}>
                <Button variant="outline">View Checklist</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}