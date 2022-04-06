import { getStarlayInfo } from './../src/starlay/index'
it('print info', async () => {
  const result = await getStarlayInfo()
  console.log(result)
})
