import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Facebook, Instagram, Twitter, Linkedin, Music2, ArrowRight, ExternalLink } from "lucide-react";

const platforms = [
  {
    name: "Facebook",
    icon: Facebook,
    color: "from-blue-500 to-blue-600",
    textColor: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    name: "Instagram",
    icon: Instagram,
    color: "from-pink-500 to-purple-600",
    textColor: "text-pink-600",
    bgColor: "bg-pink-50",
  },
  {
    name: "Twitter",
    icon: Twitter,
    color: "from-sky-400 to-sky-600",
    textColor: "text-sky-600",
    bgColor: "bg-sky-50",
  },
  {
    name: "LinkedIn",
    icon: Linkedin,
    color: "from-blue-600 to-blue-700",
    textColor: "text-blue-700",
    bgColor: "bg-blue-50",
  },
  {
    name: "TikTok",
    icon: Music2,
    color: "from-black to-gray-800",
    textColor: "text-gray-900",
    bgColor: "bg-gray-50",
  },
];

export default function Guides() {
  return (
    <div className="p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Platform Download Guides
          </h1>
          <p className="text-lg text-gray-600">
            Step-by-step instructions for downloading your data from each platform
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            
            return (
              <Card key={platform.name} className="border-none shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
                <div className={`h-2 bg-gradient-to-r ${platform.color}`} />
                <CardHeader>
                  <div className={`p-3 ${platform.bgColor} rounded-xl w-fit mb-3`}>
                    <Icon className={`w-6 h-6 ${platform.textColor}`} />
                  </div>
                  <CardTitle className="text-xl">{platform.name}</CardTitle>
                  <CardDescription>
                    Learn how to download your complete {platform.name} archive
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to={createPageUrl(`Guide_${platform.name}`)}>
                    <Button className="w-full group-hover:translate-x-1 transition-transform duration-200">
                      View Guide
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="mt-8 border-none shadow-lg">
          <CardHeader>
            <CardTitle>General Tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-blue-600">1</span>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Allow Processing Time</h4>
                <p className="text-sm text-gray-600">Most platforms take 24-48 hours to prepare your archive. Some may take up to a week for large accounts.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-purple-600">2</span>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Check Your Email</h4>
                <p className="text-sm text-gray-600">You'll receive an email notification when your archive is ready to download. Make sure to check your spam folder.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-green-600">3</span>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Download Links Expire</h4>
                <p className="text-sm text-gray-600">Most download links are only valid for a limited time (usually 7-30 days). Download your archive promptly.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-orange-600">4</span>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Storage Space</h4>
                <p className="text-sm text-gray-600">Large archives can be several gigabytes. Make sure you have enough storage space before downloading.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}