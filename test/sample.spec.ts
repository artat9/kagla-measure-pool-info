import { getKaglaInfo } from './../src/sample'
it('print info', async () => {
  const result = await getKaglaInfo()
  console.log(result)
})
