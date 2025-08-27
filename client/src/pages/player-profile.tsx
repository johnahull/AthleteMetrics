import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Calendar, MapPin, Trophy, TrendingUp, User, Zap, Edit, Plus, Mail, Phone } from "lucide-react";
import { calculateFly10Speed } from "@/lib/speed-utils";
import PlayerModal from "@/components/player-modal";
import PlayerMeasurementForm from "@/components/player-measurement-form";
import type { Player, Team, Measurement } from "@shared/schema";

export default function PlayerProfile() {
  const { id: playerId } = useParams();
  const [, setLocation] = useLocation();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddMeasurementModal, setShowAddMeasurementModal] = useState(false);

  const { data: player, isLoading: playerLoading, error: playerError } = useQuery({
    queryKey: ["/api/players", playerId],
    enabled: !!playerId,
  });

  const { data: measurements = [], isLoading: measurementsLoading } = useQuery({
    queryKey: ["/api/measurements", { playerId }],
    queryFn: async () => {
      const response = await fetch(`/api/measurements?playerId=${playerId}`);
      if (!response.ok) throw new Error('Failed to fetch measurements');
      return response.json();
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["/api/teams"],
  });

  if (playerLoading || measurementsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-32 bg-gray-200 rounded-xl"></div>
          <div className="h-96 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (playerError) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Player Not Found</h2>
          <p className="text-gray-600 mb-4">The player you're looking for doesn't exist.</p>
          <Button onClick={() => setLocation('/players')}>Back to Players</Button>
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-32 bg-gray-200 rounded-xl"></div>
          <div className="h-96 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  const fly10Measurements = measurements.filter((m: any) => m.metric === "FLY10_TIME");
  const verticalMeasurements = measurements.filter((m: any) => m.metric === "VERTICAL_JUMP");

  const bestFly10 = fly10Measurements.length > 0 
    ? Math.min(...fly10Measurements.map((m: any) => parseFloat(m.value)))
    : null;
  const bestVertical = verticalMeasurements.length > 0 
    ? Math.max(...verticalMeasurements.map((m: any) => parseFloat(m.value)))
    : null;

  const bestFly10Speed = bestFly10 ? calculateFly10Speed(bestFly10) : null;

  const getRecentMeasurements = () => {
    return measurements
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          onClick={() => setLocation('/players')}
          className="mr-4"
          data-testid="button-back-to-players"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Players
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">{player?.fullName}</h1>
          <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
            <span className="flex items-center">
              <User className="h-4 w-4 mr-1" />
              Birth Year: {player?.birthYear}
            </span>
            <span className="flex items-center">
              <Trophy className="h-4 w-4 mr-1" />
              {player?.teams && player.teams.length > 0 
                ? player.teams.map(team => team.name).join(', ')
                : 'Independent Player'
              }
            </span>
            {player?.school && (
              <span className="flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                {player.school}
              </span>
            )}
            {player?.sports && player.sports.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {player.sports.map((sport, index) => (
                  <Badge key={index} variant="secondary">{sport}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex space-x-3">
          <Button 
            onClick={() => setShowEditModal(true)}
            variant="outline"
            data-testid="button-edit-player"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit Player
          </Button>
          <Button 
            onClick={() => setShowAddMeasurementModal(true)}
            data-testid="button-add-measurement"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Measurement
          </Button>
        </div>
      </div>

      {/* Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Best Fly-10 Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {bestFly10 ? `${bestFly10.toFixed(2)}s` : 'No data'}
                </p>
                {bestFly10Speed && (
                  <p className="text-sm text-gray-500">{bestFly10Speed.toFixed(1)} mph</p>
                )}
              </div>
              <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Zap className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Best Vertical Jump</p>
                <p className="text-2xl font-bold text-gray-900">
                  {bestVertical ? `${bestVertical.toFixed(1)}in` : 'No data'}
                </p>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Measurements</p>
                <p className="text-2xl font-bold text-gray-900">{measurements.length}</p>
                <p className="text-sm text-gray-500">
                  {fly10Measurements.length} Fly-10, {verticalMeasurements.length} Vertical
                </p>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contact Information */}
      {((player?.emails && player.emails.length > 0) || (player?.phoneNumbers && player.phoneNumbers.length > 0)) && (
        <Card className="bg-white mb-8">
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Email Addresses */}
              {player?.emails && player.emails.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                    <Mail className="h-4 w-4 mr-2" />
                    Email Addresses
                  </h4>
                  <div className="space-y-2">
                    {player.emails.map((email, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <a 
                          href={`mailto:${email}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                          data-testid={`link-email-${index}`}
                        >
                          {email}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Phone Numbers */}
              {player?.phoneNumbers && player.phoneNumbers.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                    <Phone className="h-4 w-4 mr-2" />
                    Phone Numbers
                  </h4>
                  <div className="space-y-2">
                    {player.phoneNumbers.map((phone, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <a 
                          href={`tel:${phone}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                          data-testid={`link-phone-${index}`}
                        >
                          {phone}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Measurements */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Recent Measurements</CardTitle>
        </CardHeader>
        <CardContent>
          {measurements.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No measurements recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Metric</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Value</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Speed (mph)</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Fly-In Distance</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {getRecentMeasurements().map((measurement: any) => (
                    <tr key={measurement.id} className="border-b border-gray-100">
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {formatDate(measurement.date)}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Badge variant={measurement.metric === "FLY10_TIME" ? "default" : "secondary"}>
                          {measurement.metric === "FLY10_TIME" ? "Fly-10" : "Vertical Jump"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm font-mono text-gray-900">
                        {measurement.value}{measurement.units}
                      </td>
                      <td className="py-3 px-4 text-sm font-mono text-gray-600">
                        {measurement.metric === "FLY10_TIME" 
                          ? calculateFly10Speed(parseFloat(measurement.value)).toFixed(1) 
                          : '-'
                        }
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {measurement.flyInDistance ? `${measurement.flyInDistance}yd` : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {measurement.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Player Edit Modal */}
      {player && (
        <PlayerModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          player={player}
          teams={teams}
        />
      )}

      {/* Add Measurement Modal */}
      {player && (
        <Dialog open={showAddMeasurementModal} onOpenChange={setShowAddMeasurementModal}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Measurement for {player.fullName}</DialogTitle>
              <DialogDescription>
                Record a new performance measurement for this player.
              </DialogDescription>
            </DialogHeader>
            <PlayerMeasurementForm 
              playerId={player.id}
              playerName={player.fullName}
              onSuccess={() => setShowAddMeasurementModal(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}