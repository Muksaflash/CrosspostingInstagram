
"use client";

import { useState } from "react";
import { Instagram, Wand2, Send, RefreshCw, Settings, Search } from "lucide-react";
import { saveSocialNetwork } from "@/app/actions";
import Image from "next/image";

interface SocialNetwork {
  name: string;
  enabled: boolean;
  model: string;
  prompt: string;
  adaptedText?: string;
  adaptedTitle?: string;
  status?: 'idle' | 'loading' | 'success' | 'error';
  errorMsg?: string;
}

interface InstagramPost {
  imageUrl: string;
  caption: string;
  postUrl: string;
  type: string;
  mediaUrls: string[];
}

export default function Dashboard({ initialNetworks }: { initialNetworks: any[] }) {
  const [networks, setNetworks] = useState<SocialNetwork[]>(initialNetworks.length ? initialNetworks : [
    { name: 'Telegram', enabled: true, model: 'gpt-4o', prompt: 'Перепиши текст для Telegram канала...' },
    { name: 'VK', enabled: true, model: 'gpt-4o', prompt: 'Адаптируй для ВКонтакте...' },
    { name: 'Instagram', enabled: false, model: 'gpt-4o', prompt: '...' }, // Usually disable adapt for source
  ]);
  
  const [post, setPost] = useState<InstagramPost | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchLink, setFetchLink] = useState("");

  // Handler stubs - these would call Server Actions or API routes
  const handleFetchLatest = async () => {
    setLoading(true);
    // TODO: Call API
    setLoading(false);
  };

  const handleFetchByLink = async () => {
    if (!fetchLink) return;
    setLoading(true);
    // TODO: Call API
    setLoading(false);
  };
  
  const handleAdaptAll = async () => {
     // TODO: Iterate active networks and call AI
  };
  
  const handlePublishAll = async () => {
     // TODO: Call PostMyPost
  };

  const toggleNetwork = (index: number) => {
    const newNetworks = [...networks];
    newNetworks[index].enabled = !newNetworks[index].enabled;
    setNetworks(newNetworks);
    saveSocialNetwork(newNetworks[index].name, newNetworks[index]);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left Column: Source Post */}
      <div className="space-y-6 lg:col-span-1">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <Instagram className="h-5 w-5 text-pink-600" />
            Source Post
          </h2>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <button 
                onClick={handleFetchLatest}
                disabled={loading}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin inline" /> : "Fetch Latest"}
              </button>
            </div>
            
            <div className="flex gap-2">
              <input 
                value={fetchLink}
                onChange={(e) => setFetchLink(e.target.value)}
                placeholder="https://instagram.com/p/..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
               <button 
                onClick={handleFetchByLink}
                disabled={loading || !fetchLink}
                className="rounded-lg bg-gray-100 p-2 hover:bg-gray-200"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>

            {post ? (
              <div className="space-y-3 pt-4 border-t">
                 {post.imageUrl && (
                   <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
                     <img src={post.imageUrl} alt="Post preview" className="h-full w-full object-cover" />
                     <div className="absolute top-2 right-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
                       {post.type}
                     </div>
                   </div>
                 )}
                 <p className="text-sm text-gray-600 line-clamp-6">{post.caption}</p>
                 
                  <button 
                    onClick={handleAdaptAll}
                    className="w-full rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 flex items-center justify-center gap-2"
                  >
                    <Wand2 className="h-4 w-4" />
                    Adapt for Networks
                  </button>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg bg-gray-50 border-2 border-dashed">
                <p className="text-gray-400 text-sm">No post loaded</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Networks */}
      <div className="space-y-6 lg:col-span-2">
         <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Social Networks</h2>
              <button 
                onClick={handlePublishAll}
                disabled={!post}
                className="rounded-lg bg-green-600 px-6 py-2 text-white hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Publish All
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {networks.map((net, idx) => (
                <div key={net.name} className={`relative rounded-xl border p-4 transition-all ${net.enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-75'}`}>
                   <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{net.name}</span>
                        {net.status === 'loading' && <RefreshCw className="h-3 w-3 animate-spin text-gray-400" />}
                      </div>
                      <div className="flex items-center gap-2">
                         <button className="text-gray-400 hover:text-gray-600"><Settings className="h-4 w-4" /></button>
                         <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={net.enabled} onChange={() => toggleNetwork(idx)} className="sr-only peer" />
                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                         </label>
                      </div>
                   </div>
                   
                   {net.enabled && (
                     <div className="space-y-2">
                        <textarea 
                          value={net.adaptedText || ''}
                          onChange={(e) => {
                             const newNet = [...networks];
                             newNet[idx].adaptedText = e.target.value;
                             setNetworks(newNet);
                          }}
                          placeholder={net.enabled ? "Waiting for adaptation..." : "Disabled"}
                          className="w-full rounded-md border border-gray-200 p-2 text-sm focus:border-blue-500 focus:outline-none min-h-[100px]"
                        />
                         {net.adaptedTitle && (
                           <input 
                              value={net.adaptedTitle}
                              readOnly
                              className="w-full text-xs text-gray-500 bg-gray-50 p-1 rounded"
                           />
                         )}
                     </div>
                   )}
                </div>
              ))}
            </div>
         </div>
      </div>
    </div>
  );
}
