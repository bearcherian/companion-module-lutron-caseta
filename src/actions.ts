import { CompanionActionDefinition } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { DeviceDefinition, OneAreaDefinition } from 'lutron-leap'

export async function UpdateActions(self: ModuleInstance): Promise<void> {
	const deviceActions: Record<string, CompanionActionDefinition> = {}

	await Promise.all(
		self.devicesOnBridge.map(async (device) => {
			try {
				const response = await self.bridge?.getHref(device.AssociatedArea)

				const areaName = (response as OneAreaDefinition).Area.Name
				self.log('debug', `creating actions for ${areaName} ${device.Name}`)
				const deviceKeyName = device.SerialNumber
				if (
					device.DeviceType === 'WallSwitch' ||
					device.DeviceType === 'WallDimmer' ||
					device.DeviceType === 'DivaSmartDimmer'
				) {
					deviceActions[`${deviceKeyName}_turn_on`] = turnOnFunction(self, areaName, device)
					deviceActions[`${deviceKeyName}_turn_off`] = turnOffFunction(self, areaName, device)
				}
				if (device.DeviceType === 'WallDimmer' || device.DeviceType === 'DivaSmartDimmer') {
					deviceActions[`${deviceKeyName}_set_brightness`] = setBrightnessAction(self, areaName, device)
				}
			} catch (err) {
				self.log('error', `Error getting area for device ${device.Name}: ${(err as Error).message}`)
			}
		}),
	)

	self.setActionDefinitions({
		...deviceActions,
	})
}

function turnOnFunction(self: ModuleInstance, areaName: string, device: DeviceDefinition): CompanionActionDefinition {
	return {
		name: `${areaName} ${device.Name}: Turn On `,
		options: [],
		callback: async () => {
			try {
				await self.bridge?.client.request('CreateRequest', `${device.LocalZones[0].href}/commandprocessor`, {
					Command: { CommandType: 'GoToLevel', Parameter: [{ Type: 'Level', Value: 100 }] },
				})
				self.log('debug', `Turned on device: ${device.Name}`)
			} catch (err) {
				self.log('error', `Error turning on device ${device.Name}: ${(err as Error).message}`)
			}
		},
	}
}

function turnOffFunction(self: ModuleInstance, areaName: string, device: DeviceDefinition): CompanionActionDefinition {
	return {
		name: `${areaName} ${device.Name}: Turn Off `,
		options: [],
		callback: async () => {
			try {
				await self.bridge?.client.request('CreateRequest', `${device.LocalZones[0].href}/commandprocessor`, {
					Command: { CommandType: 'GoToLevel', Parameter: [{ Type: 'Level', Value: 0 }] },
				})
				self.log('debug', `Turned off device: ${device.Name}`)
			} catch (err) {
				self.log('error', `Error turning off device ${device.Name}: ${(err as Error).message}`)
			}
		},
	}
}

function setBrightnessAction(
	self: ModuleInstance,
	areaName: string,
	device: DeviceDefinition,
): CompanionActionDefinition {
	return {
		name: `${areaName} ${device.Name}: Set Brightness`,
		options: [
			{
				id: 'brightness_value',
				type: 'number',
				label: 'Brightness Value (0-100)',
				default: 50,
				min: 0,
				max: 100,
			},
		],
		callback: async (event) => {
			try {
				await self.bridge?.client.request('CreateRequest', `${device.LocalZones[0].href}/commandprocessor`, {
					Command: {
						CommandType: 'GoToLevel',
						Parameter: [{ Type: 'Level', Value: event.options.brightness_value }],
					},
				})
				self.log('debug', `Set brightness on device: ${device.Name}`)
			} catch (err) {
				self.log('error', `Error setting brightness on device ${device.Name}: ${(err as Error).message}`)
			}
		},
	}
}
