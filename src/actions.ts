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
					deviceActions[`${deviceKeyName}_turn_on`] = createDimmerAction(self, areaName, device, 'on')
					deviceActions[`${deviceKeyName}_turn_off`] = createDimmerAction(self, areaName, device, 'off')
				}
				if (device.DeviceType === 'WallDimmer' || device.DeviceType === 'DivaSmartDimmer') {
					deviceActions[`${deviceKeyName}_set_brightness`] = createDimmerAction(self, areaName, device, 'brightness')
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

function createDimmerAction(
	self: ModuleInstance,
	areaName: string,
	device: DeviceDefinition,
	actionType: 'on' | 'off' | 'brightness',
): CompanionActionDefinition {
	const isOnOff = actionType === 'on' || actionType === 'off'
	const fixedLevel = actionType === 'on' ? 100 : actionType === 'off' ? 0 : undefined

	const options: CompanionActionDefinition['options'] = []

	if (!isOnOff) {
		options.push({
			id: 'brightness_value',
			type: 'number',
			label: 'Brightness Value',
			range: true,
			default: 50,
			min: 0,
			max: 100,
		})
	}

	options.push({
		id: 'fade_time',
		type: 'number',
		label: 'Fade Time (seconds)',
		default: 4,
		min: 0,
		max: 10,
		step: 0.25,
		range: true,
	})

	return {
		name: `${areaName} ${device.Name}: ${actionType === 'on' ? 'Turn On' : actionType === 'off' ? 'Turn Off' : 'Set Brightness'}`,
		options,
		callback: async (event) => {
			const level = isOnOff ? fixedLevel : (event.options.brightness_value as number)

			// fade time input is in seconds but needs to be formatted for the API. So 1.75 seconds becomes "00:00:01.7500"
			const fadeTimeValue = (event.options.fade_time as number) || 0
			const fadeTimeFormatted = `00:00:${Math.floor(fadeTimeValue).toString().padStart(2, '0')}.${((fadeTimeValue % 1) * 10000).toFixed(0).padStart(4, '0')}`

			try {
				self.log('debug', `Setting ${device.Name} to ${level}% with fade time ${fadeTimeFormatted}`)
				const response = await self.bridge?.client.request(
					'CreateRequest',
					`${device.LocalZones[0].href}/commandprocessor`,
					{
						Command: {
							CommandType: 'GoToDimmedLevel',
							DimmedLevelParameters: { Level: level, FadeTime: fadeTimeFormatted },
						},
					},
				)
				if (!response?.Header.StatusCode?.code || response.Header.StatusCode.code > 299) {
					const errorMessage = response?.Body && 'Message' in response.Body ? response.Body.Message : 'Unknown error'
					self.log(
						'error',
						`Error setting ${device.Name}: ${response?.Header.StatusCode?.code} ${response?.Header.StatusCode?.message} - ${errorMessage}`,
					)
				}
			} catch (err) {
				self.log('error', `Error setting ${device.Name} ${actionType || 'brightness'}: ${(err as Error).message}`)
			}
		},
	}
}
